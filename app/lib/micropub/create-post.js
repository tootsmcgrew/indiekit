const fs = require('fs-extra');
const _ = require('lodash');
const getType = require('post-type-discovery');

const config = require(process.env.PWD + '/app/config');
const microformats = require(process.env.PWD + '/app/lib/microformats');
const record = require(process.env.PWD + '/app/lib/record');
const render = require(process.env.PWD + '/app/lib/render');
const store = require(process.env.PWD + '/app/lib/store');
const utils = require(process.env.PWD + '/app/lib/utils');

/**
 * Creates a new post
 *
 * @memberof micropub
 * @module createPost
 * @param {Object} pub Publication configuration
 * @param {String} mf2 Microformats2 object
 * @param {String} files File attachments
 * @returns {String} Location of created post
 */
module.exports = async (pub, mf2, files) => {
  // Determine post type
  let type;
  if (files && files.length > 0) {
    // Infer media type from first file attachment
    type = utils.deriveMediaType(files[0].mimetype);
  } else {
    // Create the `items` array getType() expects
    const items = {items: [mf2]};
    type = getType(items);
  }

  const typeConfig = _.find(pub['post-types'], {type});
  const slugSeparator = pub['slug-separator'];

  // Update properties
  const {properties} = mf2;
  properties.published = microformats.derivePuplished(mf2);
  properties.content = microformats.deriveContent(mf2);
  properties.slug = microformats.deriveSlug(mf2, slugSeparator);
  properties.photo = await microformats.derivePhoto(mf2, files, typeConfig);

  // Render template
  const templatePath = typeConfig.path.template;
  const templateData = fs.readFileSync(templatePath);
  const template = Buffer.from(templateData).toString('utf-8');
  const content = render(template, properties);

  // Render publish and destination paths
  const postPath = render(typeConfig.path.post, properties);
  const urlPath = render(typeConfig.path.url, properties);

  // Prepare location and activity record
  const url = config.url + urlPath;
  const recordData = {
    path: {
      post: postPath
    },
    mf2: {
      type: ['h-entry'],
      properties,
      'mp-slug': properties.slug
    }
  };

  // Create post on GitHub
  try {
    await store.github.createFile(postPath, content, {
      message: `${typeConfig.icon} Created ${_.lowerCase(typeConfig.name)} post \nwith ${config.name}`
    });
    record.create(url, recordData);
    return utils.success('create_pending', url);
  } catch (error) {
    throw new Error(error.message);
  }
};
