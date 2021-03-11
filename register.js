"use strict";

require('@babel/register')({
	rootMode: 'upward',
	ignore: [/node_modules/], // see https://github.com/babel/babel/issues/8945
	extensions: ['.js', '.ts', '.tsx'],
});
