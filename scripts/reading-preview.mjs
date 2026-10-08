import { createServer } from 'vite'
// Isolated local demo; never accesses the configured production Supabase project.
const server=await createServer({envDir:false,define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_ANON_KEY':'""'},server:{host:'127.0.0.1',port:5188,strictPort:true}})
await server.listen()
console.log('Reading preview: http://127.0.0.1:5188/reading')
const close=async()=>{await server.close();process.exit(0)}
process.on('SIGINT',close);process.on('SIGTERM',close)
