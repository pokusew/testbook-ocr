"use strict";

import util from 'util';
import { isDefined } from './common';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { BulkWriter, getFirestore } from 'firebase-admin/firestore';
import fs from 'fs/promises';

util.inspect.defaultOptions.depth = Infinity;


const createCategory = (writer: BulkWriter, categoriesRef, packageId, { name, number, _numQuestions }) => {
	const id = `${packageId}-${number.toString().padStart(2, '0')}`;
	const ref = categoriesRef.doc(id);
	const data = {
		name,
		number,
		_numQuestions,
	};
	writer.set(ref, data);
	return data;
};

const AUTO_CATEGORY_SIZE = 200;

const run = async (packageFile: string) => {

	const app = initializeApp({
		credential: applicationDefault(),
	});

	const db = getFirestore(app);

	const writer = db.bulkWriter();

	const dataString = await fs.readFile(packageFile, {
		encoding: 'utf-8',
	});

	let data;

	try {
		data = JSON.parse(dataString);
	} catch (e) {
		throw new Error(`Cannot parse JSON of '${packageFile}'`);
	}

	const packageId = data.id.toString();
	const packageRef = db.collection('packages').doc(data.id.toString());
	const categoriesRef = packageRef.collection('categories');
	const questionsRef = packageRef.collection('questions');

	writer.set(
		db.collection('packages').doc(data.id.toString()),
		{
			locale: data.locale,
			name: data.name,
			description: data.description,
			_numCategories: data.numCategories,
			_numQuestions: data.numQuestions,
		},
	);

	for (const category of data.categories) {
		createCategory(writer, categoriesRef, packageId, {
			name: category.name,
			number: category.number,
			_numQuestions: category.numQuestions,
		});
	}

	let lastAutoCategoryNumber = 1;
	let numQuestionsInLastAutoCategory = 0;

	for (const question of data.questions) {

		let categoryId = question.category;

		if (categoryId === -1) {

			if (numQuestionsInLastAutoCategory === AUTO_CATEGORY_SIZE) {
				createCategory(writer, categoriesRef, packageId, {
					name: `Auto ${lastAutoCategoryNumber}`,
					number: lastAutoCategoryNumber,
					_numQuestions: numQuestionsInLastAutoCategory,
				});
				lastAutoCategoryNumber++;
				numQuestionsInLastAutoCategory = 0;
			}

			categoryId = lastAutoCategoryNumber;
			numQuestionsInLastAutoCategory++;

		}

		const id = `${packageId}-${question.number.toString().padStart(4, '0')}`;
		const ref = questionsRef.doc(id);
		writer.set(
			ref,
			{
				category: `${packageId}-${categoryId.toString().padStart(2, '0')}`,
				number: question.number,
				type: question.type,
				text: question.text,
				multiple: question.multiple,
				correct: question.correct,
				choices: question.choices,
			},
		);
	}

	if (numQuestionsInLastAutoCategory > 0) {
		createCategory(writer, categoriesRef, packageId, {
			name: `Auto ${lastAutoCategoryNumber}`,
			number: lastAutoCategoryNumber,
			_numQuestions: numQuestionsInLastAutoCategory,
		});
		// lastAutoCategoryNumber++;
		// numQuestionsInLastAutoCategory = 0;
	}

	await writer.close();

	console.log('package imported');

};

// process.argv[0] - path to node (Node.js interpreter)
// process.argv[1] - path to script
if (!isDefined(process.argv[2])) {
	console.error('usage: {packageFile}');
	process.exit(1);
}

run(process.argv[2])
	.then(() => {
		console.log('script finished');
		process.exit(0);
	})
	.catch(err => {
		console.error('an error occurred while running script', err);
		process.exit(1);
	});