"use strict";

import util from 'util';
import { isDefined } from './common';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { BulkWriter, getFirestore, GrpcStatus } from 'firebase-admin/firestore';
import fs from 'fs/promises';

util.inspect.defaultOptions.depth = 10;


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

	// see https://firebase.google.com/docs/admin/setup#initialize-sdk
	const app = initializeApp({
		// set the environment variable GOOGLE_APPLICATION_CREDENTIALS
		// to the file path of the JSON file that contains your service account key
		credential: applicationDefault(),
	});

	const db = getFirestore(app);

	const writer = db.bulkWriter();

	// see https://googleapis.dev/nodejs/firestore/latest/BulkWriter.html#onWriteError
	writer.onWriteError((error) => {
		if (error.code === GrpcStatus.UNAVAILABLE && error.failedAttempts < 10) {
			return true;
		} else {
			console.error(`write error code=${error.code}, documentRef=${error.documentRef.path}, operationType=${error.operationType}, failedAttempts=${error.failedAttempts}:`, error.message);
			return false;
		}
	});

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
	const packageRef = db.collection('packages').doc(packageId);
	const categoriesRef = packageRef.collection('categories');
	const questionsRef = packageRef.collection('questions');

	console.log(`writing ${packageRef.path}`);

	writer.set(
		packageRef,
		{
			locale: data.locale,
			name: data.name,
			description: data.description,
			_numCategories: data.numCategories,
			_numQuestions: data.numQuestions,
		},
	);

	const numQuestionsPerCategory: Map<number, number> = new Map<number, number>();
	const boundaryCategoryMapping: [number, number][] = [];

	// relying on correct ordering and meaningful fromIncl/toIncl values
	for (let i = data.categories.length - 1; i >= 0; i--) {
		const category = data.categories[i];
		if (isDefined(category.fromIncl) && isDefined(category.toIncl)) {
			boundaryCategoryMapping.push([category.fromIncl, category.number]);
		}
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

		if (categoryId === -2) {
			const boundary = boundaryCategoryMapping.find(
				([fromIncl, c]) => question.number >= fromIncl,
			);
			if (!isDefined(boundary)) {
				throw new Error(`Failed to find corresponding category for question number ${question.number}.`);
			}
			categoryId = boundary[1];
			// console.log(question.number, categoryId);
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

		numQuestionsPerCategory.set(categoryId, (numQuestionsPerCategory.get(categoryId) ?? 0) + 1);

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

	for (const category of data.categories) {
		if (!numQuestionsPerCategory.has(category.number)) {
			throw new Error(`unexpected: numQuestionsPerCategory.has(${category.number}) === false`);
		}
		createCategory(writer, categoriesRef, packageId, {
			name: category.name,
			number: category.number,
			_numQuestions: numQuestionsPerCategory.get(category.number),
		});
	}

	// note: this Promise will never be rejected
	//   see https://googleapis.dev/nodejs/firestore/latest/BulkWriter.html#close
	//   see https://googleapis.dev/nodejs/firestore/latest/BulkWriter.html#onWriteError
	//   see https://googleapis.dev/nodejs/firestore/latest/BulkWriter.html#set
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
