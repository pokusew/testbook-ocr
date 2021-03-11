"use strict";

import util from 'util';
import { isDefined } from './common';

util.inspect.defaultOptions.depth = Infinity;

import { v1 as vision, protos } from '@google-cloud/vision';

const ImageAnnotatorClient = vision.ImageAnnotatorClient;


// TODO: improve, see https://stackoverflow.com/questions/19687407/press-any-key-to-continue-in-nodejs
const waitForKeyPress = () => new Promise(((resolve) => {
	process.stdin.once('data', () => {
		resolve();
	});
}));


const run = async (bucketName: string, fileName: string, outputPrefix: string) => {

	// create a client
	// note: authentication is done automatically using env variables
	//       see https://cloud.google.com/docs/authentication/production
	const client = new ImageAnnotatorClient();

	// bucket where the file resides
	// const bucketName = 'testbook-ocr';
	// path to PDF file within bucket
	// const fileName = 'test/Modelovky_Biologie_1LF_2011.pdf';
	// the dir where to store the results
	// const outputPrefix = 'results/Modelovky_Biologie_1LF_2011';

	const gcsSourceUri = `gs://${bucketName}/${fileName}`;
	const gcsDestinationUri = `gs://${bucketName}/${outputPrefix}/`;

	const inputConfig: protos.google.cloud.vision.v1.IInputConfig = {
		// supported mime_types are: 'application/pdf' and 'image/tiff'
		mimeType: 'application/pdf',
		gcsSource: {
			uri: gcsSourceUri,
		},
	};
	const outputConfig: protos.google.cloud.vision.v1.IOutputConfig = {
		gcsDestination: {
			uri: gcsDestinationUri,
		},
	};
	const request: protos.google.cloud.vision.v1.IAsyncBatchAnnotateFilesRequest = {
		requests: [
			{
				inputConfig: inputConfig,
				features: [
					{
						type: 'DOCUMENT_TEXT_DETECTION',
					},
				],
				outputConfig: outputConfig,
			},
		],
	};

	console.log('client.asyncBatchAnnotateFiles', request);

	console.log('press <enter> key to continue');

	await waitForKeyPress();

	const [operation] = await client.asyncBatchAnnotateFiles(request);

	console.log(`operation enqueued, name=${operation.name}`, operation.metadata);

	const [filesResponse] = await operation.promise();

	console.log('operation finished, filesResponse', filesResponse);

	const destinationUri = filesResponse.responses?.[0]?.outputConfig?.gcsDestination?.uri;

	console.log(`json saved to: ${destinationUri}`);

};

// process.argv[0] - path to node (Node.js interpreter)
// process.argv[1] - path to script
if (!isDefined(process.argv[2]) || !isDefined(process.argv[3]) || !isDefined(process.argv[4])) {
	console.error('usage: {bucketName} {fileName} {outputPrefix}');
	process.exit(1);
}

run(process.argv[2], process.argv[3], process.argv[4])
	.then(() => {
		console.log('script finished');
		process.exit(0);
	})
	.catch(err => {
		console.error('an error occurred while running script', err);
		process.exit(1);
	});
