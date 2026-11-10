import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      proxy: {
        // tourapi/api.py 서버(공공데이터 API 묶음)를 같은 출처로 부른다.
        // 기본은 내 PC에서 `py api.py local`로 켠 서버, 배포 서버를 쓰려면
        // .env.local에 TOURAPI_PROXY_TARGET=https://tourapi-demo.vercel.app 을 넣는다.
        '/tourapi': {
          target: env.TOURAPI_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/tourapi/, ''),
        },
      },
    },
  }
})
