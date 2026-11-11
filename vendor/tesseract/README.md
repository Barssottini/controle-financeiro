# Tesseract.js (leitura de texto em imagem, no aparelho)

Usado pelo "Importar comprovante": le o texto de um print ou foto de comprovante
sem enviar a imagem para servidor nenhum. Carregado so quando alguem escolhe uma
imagem.

- tesseract.min.js, worker.min.js: tesseract.js 5.1.1 (Apache-2.0), npm `tesseract.js`, pasta dist/
- tesseract-core-simd-lstm.wasm.js, tesseract-core-lstm.wasm.js: tesseract.js-core 5.1.1 (Apache-2.0); o worker escolhe a versao com SIMD quando o aparelho suporta
- por.traineddata: modelo do portugues, `@tesseract.js-data/por` 1.0.0, pasta 4.0.0_best_int (Apache-2.0, do projeto tessdata), guardado descompactado

Licenca: LICENSE.txt (Apache-2.0).
