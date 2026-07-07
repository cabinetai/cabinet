import { ollamaProvider } from "../src/lib/agents/providers/ollama";
async function run() {
  if (ollamaProvider.listModels) {
    try {
      const models = await ollamaProvider.listModels();
      console.log("MODELS:", models);
    } catch (e) {
      console.error("ERROR:", e);
    }
  } else {
    console.log("NO listModels");
  }
}
run();
