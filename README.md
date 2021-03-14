# testbook-ocr


## Usage

* `run-ocr`

    ```bash
    nodemon -r ./register.js scripts/run-ocr.ts \
    testbook-ocr \
    test/Modelovky_Biologie_1LF_2011.pdfx \
    results/Modelovky_Biologie_1LF_2011
    ```

* `post-process.ts`
    ```bash
    nodemon -r ./register.js scripts/post-process.ts \
    data/modelovky-biologie-1lf-2011/ocr-output/ \
    data/modelovky-biologie-1lf-2011/pages-original/
    ```

* `parse-questions.ts`
    ```bash
    nodemon -r ./register.js scripts/parse-questions.ts \
    data/modelovky-biologie-1lf-2011/pages/ \
    data/modelovky-biologie-1lf-2011/questions/
    ```


## Useful resources


### Unicode

* [What Unicode character is this?](https://babelstone.co.uk/Unicode/whatisit.html)
* [Unicode Slide Show](https://babelstone.co.uk/Unicode/unicode.html)
* more Unicode tools: https://babelstone.co.uk/Unicode/


### Google Cloud Vision

* https://cloud.google.com/vision/docs/pdf
* https://cloud.google.com/vision/docs/fulltext-annotations

* https://cloud.google.com/docs/authentication/production

* https://cloud.google.com/vision/docs/reference/rest/v1/files/asyncBatchAnnotate

* https://cloud.google.com/vision/pricing
* https://cloud.google.com/vision/docs/languages


### OCR in Python

* https://nanonets.com/blog/ocr-with-tesseract/
* https://www.pyimagesearch.com/category/optical-character-recognition-ocr/
