"use strict";

import path from 'path';
import fs from 'fs/promises';

import util from 'util';
import { isDefined, toPrettyJSON } from './common';

util.inspect.defaultOptions.depth = Infinity;

const PAGE_QUESTIONS_FILE_NAME = /page-([0-9]{4})\.json/;


const run = async (questionsDir: string, memorioOutputDir: string) => {

	console.log(`questionsDir = ${questionsDir}`);
	console.log(`memorioOutputDir = ${memorioOutputDir}`);

	// const questionsFileNameBase = path.join(questionsDir, 'page-');
	//
	// const getQuestionsFileName = (pageNumber: number) =>
	// 	`${questionsFileNameBase}${pageNumber.toString().padStart(4, '0')}.json`;

	const files = await fs.readdir(questionsDir);

	const questionsFiles = files.filter(name => PAGE_QUESTIONS_FILE_NAME.test(name));

	// sort names (A-Z) (in place)
	questionsFiles.sort();

	const transformedQuestions: any[] = [];

	for (const file of questionsFiles) {

		console.log(`processing ${file}`);

		const pageNumber = Number.parseInt(file.match(PAGE_QUESTIONS_FILE_NAME)?.[1] ?? '');

		if (!Number.isInteger(pageNumber)) {
			throw new Error(`Cannot parse page number from file name '${file}'`);
		}

		const questionsString = await fs.readFile(path.join(questionsDir, file), {
			encoding: 'utf-8',
		});

		let questions;

		try {
			questions = JSON.parse(questionsString);
		} catch (e) {
			throw new Error(`Cannot parse JSON of '${file}'`);
		}

		for (const question of questions) {

			transformedQuestions.push({
				id: question.id,
				package: 1,
				category: question.category,
				number: question.number,
				type: 'choice',
				text: question.text,
				multiple: true,
				correct: question.choices.filter(choice => choice.correct).map(choice => choice.id),
				choices: question.choices.map(choice => ({
					id: choice.id,
					text: choice.text,
				})),
			});

		}

	}

	const outputFile = path.join(memorioOutputDir, 'questions.json');

	await fs.writeFile(outputFile, toPrettyJSON(transformedQuestions));

	console.log(`> written ${outputFile}`);

	console.log(`> total num questions = ${transformedQuestions.length}`);

	console.log(`finished`);

};

// process.argv[0] - path to node (Node.js interpreter)
// process.argv[1] - path to script
if (!isDefined(process.argv[2]) || !isDefined(process.argv[3])) {
	console.error('usage: {questionsDir} {memorioOutputDir}');
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