import axios, { isCancel } from 'axios'

// Global timeout for all axios requests — lowered to 4s so the app never hangs long
axios.defaults.timeout = 4000

// Pre-configured instance for new code
const api = axios.create({
  timeout: 4000,
})

export default api
export { isCancel }
