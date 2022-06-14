"use strict";

import util from 'util';
import { isDefined } from './common';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

util.inspect.defaultOptions.depth = Infinity;


const run = async (uid: string, claimsString: string) => {

	const app = initializeApp({
		credential: applicationDefault(),
	});

	const auth = getAuth(app);

	const claims = claimsString === 'null' ? null : JSON.parse(claimsString);

	await auth.setCustomUserClaims(uid, claims);

	console.log('custom claims successfully set', uid, claims);

};

// process.argv[0] - path to node (Node.js interpreter)
// process.argv[1] - path to script
if (!isDefined(process.argv[2]) || !isDefined(process.argv[3])) {
	console.error('usage: {uid} {claims}');
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
