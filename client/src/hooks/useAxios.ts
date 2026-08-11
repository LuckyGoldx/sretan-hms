import axios from 'axios'

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

apiClient.interceptors.request.use((config) => {
  config.headers['x-master-token'] = 'sretan-emr-master-token-2026'
  try {
    const stored = localStorage.getItem('sretan_user')
    if (stored) {
      const user = JSON.parse(stored)
      if (user.role) config.headers['x-user-role'] = user.role
      if (user.user_type) config.headers['x-user-type'] = user.user_type
      if (user.provider_id) config.headers['x-user-provider-id'] = user.provider_id
    }
  } catch {}
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status } = error.response
      if (status === 401) {
        console.error('Unauthorized – redirecting to login')
      } else if (status === 403) {
        console.error('Forbidden – insufficient permissions')
      } else if (status === 500) {
        console.error('Internal server error')
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
