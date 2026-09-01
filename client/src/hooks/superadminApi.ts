import axios from 'axios'

const superadminApi = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

superadminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('sretan_superadmin_token')
  if (token) config.headers['x-superadmin-token'] = token
  try {
    const stored = localStorage.getItem('sretan_user')
    if (stored) {
      const user = JSON.parse(stored)
      if (user.id) config.headers['x-superadmin-id'] = user.id
    }
  } catch {}
  return config
})

superadminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('sretan_superadmin_token')
      window.location.href = '/superadmin/login'
    }
    return Promise.reject(error)
  }
)

export default superadminApi
