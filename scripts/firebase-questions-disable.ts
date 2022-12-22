"use strict";

import util from 'util';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, GrpcStatus } from 'firebase-admin/firestore';

util.inspect.defaultOptions.depth = 10;


const range = (startAtIncl: number, stopAtIncl: number): ReadonlyArray<number> => {
	const size = stopAtIncl - startAtIncl + 1;
	return [...Array(size).keys()].map(i => i + startAtIncl);
};

const questionNumberToId = (packageId: string, questionNumber: number) =>
	`${packageId}-${questionNumber.toString().padStart(4, '0')}`;

const run = async () => {

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

	const packageId = '3';
	const packageRef = db.collection('packages').doc(packageId);
	const questionsRef = packageRef.collection('questions');

	const questionsNumbers = [
		...range(143, 217),
		...range(306, 312),
		...range(619, 625),
		...range(753, 762),
		...range(834,861),
		...range(1150, 1210),
	];

	console.log(questionsNumbers);

	const questionsToDisable = questionsNumbers.map(number => questionNumberToId(packageId, number));

	console.log(questionsToDisable);

	questionsToDisable.forEach((questionId) => {
		const questionRef = questionsRef.doc(questionId);
		writer.update(questionRef, { disabled: true });
	});

	// note: this Promise will never be rejected
	//   see https://googleapis.dev/nodejs/firestore/latest/BulkWriter.html#close
	//   see https://googleapis.dev/nodejs/firestore/latest/BulkWriter.html#onWriteError
	//   see https://googleapis.dev/nodejs/firestore/latest/BulkWriter.html#set
	await writer.close();

	console.log('questions ignored');

};

// process.argv[0] - path to node (Node.js interpreter)
// process.argv[1] - path to script
// if (!isDefined(process.argv[2])) {
// 	console.error('usage: {packageFile}');
// 	process.exit(1);
// }

run()
	.then(() => {
		console.log('script finished');
		process.exit(0);
	})
	.catch(err => {
		console.error('an error occurred while running script', err);
		process.exit(1);
	});
