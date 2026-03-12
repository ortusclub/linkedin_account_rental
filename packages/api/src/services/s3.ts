import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { PROFILE_S3_PREFIX } from '@linkedin-rental/shared'

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
  forcePathStyle: true, // Required for MinIO
})

const BUCKET = process.env.S3_BUCKET || 'linkedin-profiles'
const SIGNED_URL_EXPIRY = 3600 // 1 hour

export function profileKey(accountId: string): string {
  return `${PROFILE_S3_PREFIX}${accountId}/profile.tar.gz`
}

export async function getProfileDownloadUrl(accountId: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: profileKey(accountId),
  })
  return getSignedUrl(s3, command, { expiresIn: SIGNED_URL_EXPIRY })
}

export async function getProfileUploadUrl(accountId: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: profileKey(accountId),
    ContentType: 'application/gzip',
  })
  return getSignedUrl(s3, command, { expiresIn: SIGNED_URL_EXPIRY })
}

export async function deleteProfile(accountId: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: profileKey(accountId),
  })
  await s3.send(command)
}

export async function getExtensionUploadUrl(accountId: string, extensionId: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: `extensions/${accountId}/${extensionId}.crx`,
    ContentType: 'application/x-chrome-extension',
  })
  return getSignedUrl(s3, command, { expiresIn: SIGNED_URL_EXPIRY })
}

export { s3, BUCKET }
