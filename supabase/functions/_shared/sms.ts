// Sends a text message. SMS_PROVIDER picks the provider:
//   019  019 SMS (https://docs.019sms.co.il/sms/send-sms.html); needs
//        SMS_019_USERNAME, SMS_019_TOKEN and SMS_019_SOURCE (sender name,
//        up to 11 English letters or digits).
//   log  writes the message to the function log instead (for development:
//        Supabase dashboard → Edge Functions → send-otp → Logs).
// To switch provider, add a branch here; nothing else knows who sends the SMS.

function env(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not set`)
  return value
}

export async function sendSms(phoneKey: string, text: string): Promise<void> {
  const provider = Deno.env.get('SMS_PROVIDER')
  if (provider === '019') return send019(phoneKey, text)
  if (provider === 'log') {
    console.log(`[SMS to ${phoneKey}] ${text}`)
    return
  }
  throw new Error(`SMS_PROVIDER must be '019' or 'log' (got '${provider ?? ''}')`)
}

async function send019(phoneKey: string, text: string): Promise<void> {
  const res = await fetch('https://019sms.co.il/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env('SMS_019_TOKEN')}` },
    body: JSON.stringify({
      sms: {
        user: { username: env('SMS_019_USERNAME') },
        source: env('SMS_019_SOURCE'),
        destinations: { phone: [{ _: phoneKey }] },
        message: text,
      },
    }),
  })
  const data = await res.json().catch(() => null)
  // Status 0 means accepted ("SMS will be sent").
  if (!res.ok || Number(data?.status) !== 0) {
    throw new Error(`019 SMS failed: HTTP ${res.status} ${JSON.stringify(data)}`)
  }
}
