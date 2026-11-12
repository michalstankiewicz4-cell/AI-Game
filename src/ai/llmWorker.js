// Wątek roboczy WebLLM: model liczy się tutaj, więc główna pętla gry nie czeka na obsługę modelu.
// Adres musi być taki sam jak WEBLLM_URL w llm.js.
import { WebWorkerMLCEngineHandler } from 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/+esm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
