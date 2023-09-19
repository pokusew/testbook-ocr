"use strict";

module.exports = {
	"presets": [
		[
			"@babel/preset-env",
			{
				"targets": {
					"node": "20",
				},
				"useBuiltIns": "usage",
				"corejs": "3",
				"debug": false,
			},
		],
		[
			"@babel/preset-typescript",
			{
				"onlyRemoveTypeImports": true,
			},
		],
	],
	"plugins": [],
	"env": {
		"production": {
			"presets": [],
			"plugins": [],
		},
		"test": {
			"presets": [],
			"plugins": [],
		},
		"development": {
			"presets": [],
			"plugins": [],
		},
	},
	"ignore": [
		"**/*.no-babel.js",
		/node_modules/,
		"**/dist",
	],
	"sourceMaps": true,
	"babelrcRoots": [
		".",
	],
};
