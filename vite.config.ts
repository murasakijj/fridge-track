import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // firebase チャンク単体で約 530kB(圧縮後 160kB)。分割済みなので警告の閾値を引き上げる。
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Firebase SDK は大きいので別チャンクにする(アプリ本体の更新で再取得させない)。
        codeSplitting: {
          groups: [
            {
              name: "firebase",
              test: /node_modules[\\/](@firebase|firebase)[\\/]/,
            },
          ],
        },
      },
    },
  },
});
