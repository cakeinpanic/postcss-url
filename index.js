var fs = require('fs')
var path = require('path')
var url = require('url')
var reduceFunctionCall = require('reduce-function-call')
var mkdirp = require('mkdirp');


module.exports = function fixUrl(options) {
	options = options || {};

	return function(styles, postcssOptions) {
		var to = postcssOptions.opts.to ? path.dirname(postcssOptions.opts.to) : '.';

		styles.eachDecl(function(decl) {
			if (decl.value && decl.value.indexOf('url(') > -1) {
				processDecl(decl, to, options)
			}
		})
	}
};

function getUrlMetaData(string) {
	var quote = '';
	var quotes = ['\"', '\''];
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

function createUrl(urlMeta, newPath) {
	return 'url(' +
		urlMeta.before +
		urlMeta.quote +
		(newPath || urlMeta.value) +
		urlMeta.quote +
		urlMeta.after +
		')'
}

function notLocalImg(urlMeta) {
	// ignore absolute urls, hasshes or data uris
	return urlMeta.value.indexOf('/') === 0 ||
		urlMeta.value.indexOf('data:') === 0 ||
		urlMeta.value.indexOf('#') === 0 ||
		/^[a-z]+:\/\//.test(urlMeta.value)
}

function processDecl(decl, to, options) {
	var dirname = decl.source && decl.source.input ? path.dirname(decl.source.input.file) : process.cwd();

	decl.value = reduceFunctionCall(decl.value, 'url', function(value) {
		var urlMeta = getUrlMetaData(value);

		if (notLocalImg(urlMeta)) {
			return createUrl(urlMeta)
		}
		return processCopy(dirname, urlMeta, to, options)
	})
}

function getFileUrl(dirname, fileUrl) {
	var filePath = path.resolve(dirname, fileUrl);
	// remove hash or parameters in the url. e.g., url('glyphicons-halflings-regular.eot?#iefix')
	return url.parse(filePath, true).pathname;
}

function placeAsset(assetPath, contents) {
	mkdirp.sync(path.dirname(assetPath));
	try {
		fs.accessSync(assetPath);
	} catch (err) {
		fs.writeFileSync(assetPath, contents);
	}
}

function checkAsset(filePath) {
	try {
		var contents = fs.readFileSync(filePath);

		return contents;
	} catch (err) {
		console.warn("Can't read file '" + filePath + "', ignoring")
		return false;
	}
}
function processCopy(dirname, urlMeta, to, options) {
	var relativeAssetsPath = '';
	var absoluteAssetsPath;
	var filePath = getFileUrl(dirname, urlMeta.value);
	var fileName = path.basename(urlMeta.value);
	var contents = checkAsset(filePath);

	if (options && options.assetsPath) {
		if (options.relative) {
			absoluteAssetsPath = path.resolve(to, options.assetsPath);
			relativeAssetsPath = options.assetsPath;
		} else {
			absoluteAssetsPath = options.assetsPath;
			relativeAssetsPath = path.relative(to, absoluteAssetsPath);
		}
	}

	absoluteAssetsPath = path.resolve(path.join(absoluteAssetsPath, fileName));
	relativeAssetsPath = path.join(relativeAssetsPath, fileName);

	console.log('absolute',absoluteAssetsPath)
	console.log('relative',relativeAssetsPath)
	if (!contents) {
		return createUrl(urlMeta);
	}

	placeAsset(absoluteAssetsPath, contents);

	return createUrl(urlMeta, relativeAssetsPath);

}
