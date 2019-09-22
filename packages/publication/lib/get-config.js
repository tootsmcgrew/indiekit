const _ = require('lodash');
const {getFile, logger} = require('@indiekit/support');
const getCategories = require('./get-categories');
const getPostTypes = require('./get-post-types');

/**
 * Merge publication’s configured post types (caching any referenced templates)
 * with default values set by application.
 *
 * @private
 * @function resolvePostTypes
 * @param {Object} opts Module options
 * @param {String} configPostTypes Post types configured by publication
 * @param {Object} defaultPostTypes Default post types
 * @returns {Promise} Post types object
 */
async function resolvePostTypes(opts, configPostTypes, defaultPostTypes) {
  try {
    // Error if `post-types` is an array
    if (Array.isArray(configPostTypes)) {
      throw new TypeError('`post-types` should be an object');
    }

    // Cache configured templates
    const cachedTemplates = [];
    for (const key in configPostTypes) {
      if (typeof configPostTypes[key] === 'object') {
        const configPostType = configPostTypes[key];
        if (configPostType.template) {
          cachedTemplates.push(
            getFile(configPostType.template, opts.publisher)
          );

          // Update `template` with `cacheKey` value
          configPostType.template = {
            cacheKey: configPostType.template
          };
        }
      } else {
        throw new TypeError('Post type should be an object');
      }
    }

    // Wait for all templates to be cached
    await Promise.all(cachedTemplates);

    // Merge default and publication post types
    const resolvedPostTypes = _.merge(defaultPostTypes, configPostTypes);

    return resolvedPostTypes;
  } catch (error) {
    throw new TypeError(error.message);
  }
}

/**
 * Merge publication’s configuration with default values set by application.
 *
 * @private
 * @exports resolveConfig
 * @param {Object} opts Module options
 * @returns {Promise} Resolved configuration object
 */
async function resolveConfig(opts) {
  const {defaults} = opts;
  const {configPath} = opts;

  let config;
  if (configPath) {
    // Get remote configuration file (if provided)
    try {
      const configFile = await getFile(configPath, opts.publisher);
      config = JSON.parse(configFile);
    } catch (error) {
      throw new Error(error.message);
    }
  } else {
    // Use provided configuration (if provided)
    config = opts.config;
  }

  try {
    // Return default configuration if provided value not found
    if (!config) {
      logger.info('Configuration not found. Using defaults');

      return defaults;
    }

    // Merge publisher settings with default config
    const resolvedConfig = _.merge(defaults, config);

    // Merge publisher post types (with cached templates) with default config
    const configPostTypes = config['post-types'];
    if (configPostTypes) {
      const defaultPostTypes = defaults['post-types'];
      const resolvedPostTypes = await resolvePostTypes(opts, configPostTypes, defaultPostTypes).catch(error => {
        throw new Error(error.message);
      });
      resolvedConfig['post-types'] = resolvedPostTypes;
    }

    return resolvedConfig;
  } catch (error) {
    throw new Error(error.message);
  }
}

/**
 * Get publication’s configuration.
 *
 * @exports getConfig
 * @param {Object} opts Module options
 * @returns {Object} Configuration object
 */
module.exports = async opts => {
  const resolvedConfig = await resolveConfig(opts);

  return {
    config: {
      categories: await getCategories(resolvedConfig.categories),
      'media-endpoint': resolvedConfig['media-endpoint'] || `${opts.endpointUrl}/media`,
      'post-types': getPostTypes(resolvedConfig['post-types']),
      'syndicate-to': resolvedConfig['syndicate-to']
    },
    'post-types': resolvedConfig['post-types'],
    publisher: opts.publisher,
    'slug-separator': resolvedConfig['slug-separator'],
    url: opts.url
  };
};