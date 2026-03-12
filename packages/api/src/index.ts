import express from 'express'
import cors from 'cors'
import { authRouter } from './routes/auth'
import { accountsRouter } from './routes/accounts'
import { usersRouter } from './routes/users'
import { sessionsRouter } from './routes/sessions'
import { proxiesRouter } from './routes/proxies'
import { orgRouter } from './routes/org'
import { errorHandler } from './middleware/error-handler'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// Routes
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/org', orgRouter)
app.use('/api/v1/users', usersRouter)
app.use('/api/v1/accounts', accountsRouter)
app.use('/api/v1/sessions', sessionsRouter)
app.use('/api/v1/proxies', proxiesRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Error handler
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`)
})

export default app
