"use strict";

import path from 'path';
import fs from 'fs/promises';

import util from 'util';
import { protos } from '@google-cloud/vision';
import { isDefined } from './common';

util.inspect.defaultOptions.depth = Infinity;


const run = async (ocrOutputDir: string, pagesDir: string) => {

	console.log(`ocrOutputDir = ${ocrOutputDir}`);
	console.log(`pagesDir = ${pagesDir}`);

	const pageFileNameBase = path.join(pagesDir, 'page-');

	const getPageFileName = (pageNumber: number) =>
		`${pageFileNameBase}${pageNumber.toString().padStart(4, '0')}.txt`;

	const files = await fs.readdir(ocrOutputDir);

	const jsonFiles = files.filter(name => name.endsWith('.json'));

	for (const file of jsonFiles) {

		console.log(`processing ${file}`);

		const dataString = await fs.readFile(path.join(ocrOutputDir, file), {
			encoding: 'utf-8',
		});

		const data: protos.google.cloud.vision.v1.IAnnotateFileResponse = JSON.parse(dataString);

		if (!isDefined(data.responses)) {
			throw new Error(`${file}: responses field not defined`);
		}

		console.log(`  - total responses length = ${data.responses.length}`);

		for (let i = 0; i < data.responses.length; i++) {

			const response = data.responses[i];

			const pageNumber = response.context?.pageNumber;
			const text = response.fullTextAnnotation?.text;

			if (!isDefined(pageNumber)) {
				throw new Error(`${file}: responses[${i}].context.pageNumber is undefined`);
			}

			if (!isDefined(text)) {
				console.log(`  > an empty page ${pageNumber} in detected (${file}: responses[${i}].fullTextAnnotation.text is undefined)`);
			}

			const outputFile = getPageFileName(pageNumber);

			await fs.writeFile(outputFile, text ?? '');

			console.log(`  > written ${outputFile}`);

		}

	}


	console.log(`finished`);

};

// process.argv[0] - path to node (Node.js interpreter)
// process.argv[1] - path to script
if (!isDefined(process.argv[2]) || !isDefined(process.argv[3])) {
	console.error('usage: {ocrOutputDir} {pagesDir}');
	process.exit(1);
}

run(process.argv[2], process.argv[3])
	.then(() => {
		console.log('script finished');
		process.exit(0);
	})
	.catch(err => {
		console.error('an error occurred while running script', err);
		process.exit(1);
	});
