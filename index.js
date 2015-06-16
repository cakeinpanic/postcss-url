/**
 * Module dependencies.
 */
var fs = require('fs')
var path = require('path')
var url = require('url')
var reduceFunctionCall = require('reduce-function-call')
var mkdirp = require('mkdirp');

/**
 * Fix url() according to source (`from`) or destination (`to`)
 *
 * @param {Object} options plugin options
 * @return {void}
 */
module.exports = function fixUrl(options) {
	options = options || {};

	return function(styles, postcssOptions) {
		var from = postcssOptions.opts.from ? path.dirname(postcssOptions.opts.from) : '.';
		var to = postcssOptions.opts.to ? path.dirname(postcssOptions.opts.to) : from;

		styles.eachDecl(function(decl) {
			if (decl.value && decl.value.indexOf('url(') > -1) {
				processDecl(decl, from, to,  options)
			}
		})
	}
};

/**
 * return quote type
 *
 * @param  {String} string quoted (or not) value
 * @return {String} quote if any, or empty string
 */
function getUrlMetaData(string) {
	var quote = '';
	var quotes = ['\'', '\''];
	var trimedString = string.trim();
	quotes.forEach(function(q) {
		if (trimedString.charAt(0) === q && trimedString.charAt(trimedString.length - 1) === q) {
			quote = q
		}
	});

	return {
		before: string.slice(0, string.indexOf(quote)),
		quote: quote,
		value: quote ? trimedString.substr(1, trimedString.length - 2) : trimedString,
		after: string.slice(string.lastIndexOf(quote) + 1),
	};
}

/**
 * Create an css url() from a path and a quote style
 *
 * @param {String} urlMeta url meta data
 * @param {String} newPath url path
 * @return {String} new url()
 */
function createUrl(urlMeta) {
	return 'url(' +
		urlMeta.before +
		urlMeta.quote +
		urlMeta.value +
		urlMeta.quote +
		urlMeta.after +
		')'
}

function needToCopy(urlMeta) {
	return urlMeta.value.indexOf('/') === 0 ||
		urlMeta.value.indexOf('data:') === 0 ||
		urlMeta.value.indexOf('#') === 0 ||
		/^[a-z]+:\/\//.test(urlMeta.value)
}
/**
 * Processes one declaration
 *
 * @param {Object} decl postcss declaration
 * @param {String} from source
 * @param {String} to destination
 * @param {String|Function} mode plugin mode
 * @param {Object} options plugin options
 * @return {void}
 */
function processDecl(decl, from, to,  options) {
	var dirname = decl.source && decl.source.input ? path.dirname(decl.source.input.file) : process.cwd();
	decl.value = reduceFunctionCall(decl.value, 'url', function(value) {
		var urlMeta = getUrlMetaData(value);

		// ignore absolute urls, hasshes or data uris
		if ( needToCopy(urlMeta)) {
			return createUrl(urlMeta)
		}
		return processCopy(dirname, urlMeta, to, options)
	})
}

/**
 * Copy images from readed from url() to an specific assets destination (`assetsPath`)
 * and fix url() according to that path.
 * You can rename the assets by a hash or keep the real filename.
 *
 * Option assetsPath is require and is relative to the css destination (`to`)
 *
 * @param {String} from from
 * @param {String} dirname to dirname
 * @param {String} urlMeta url meta data
 * @param {String} to destination
 * @param {Object} options plugin options
 * @return {String} new url
 */
function processCopy(dirname, urlMeta, to, options) {
	var absoluteAssetsPath;
	var relativeAssetsPath = '';
	var contents;

	if (options && options.assetsPath) {
		if (options.relative) {
			absoluteAssetsPath = path.resolve(to, options.assetsPath);
			relativeAssetsPath = options.assetsPath;
		} else {
			absoluteAssetsPath = options.assetsPath;
			relativeAssetsPath = path.relative(to, absoluteAssetsPath);
		}
	}

	var filePathUrl = path.resolve(dirname, urlMeta.value);
	var nameUrl = path.basename(filePathUrl);

	// remove hash or parameters in the url. e.g., url('glyphicons-halflings-regular.eot?#iefix')
	var filePath = url.parse(filePathUrl, true).pathname;
	var name = path.basename(filePath);

	//check if the file exist in the source
	try {
		contents = fs.readFileSync(filePath)
	} catch (err) {
		console.warn('Can\'t read file' + filePath + ', ignoring');
		return createUrl(urlMeta)
	}

	// create the destination directory if it not exist
	mkdirp.sync(absoluteAssetsPath);

	absoluteAssetsPath = path.join(absoluteAssetsPath, name);

	// if the file doesn't exist in destination, create it.
	try {
		fs.accessSync(absoluteAssetsPath)
	} catch (err) {
		fs.writeFileSync(absoluteAssetsPath, contents)
	}

	return createUrl(urlMeta, path.join(relativeAssetsPath, nameUrl))
}
