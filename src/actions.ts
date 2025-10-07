'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

export async function startQuiz(formData: FormData) {
    const data = JSON.stringify(Object.fromEntries(formData.entries()))
    console.log(`Starting quiz with data: ${data}`)

    const response = await fetch(`${API_URL}/start`, {
        method: 'POST',
        body: data,
        headers: {
            'Content-Type': 'application/json'
        }
    })
    if (!response?.ok) throw new Error(`Failed to start quiz (${response.status})`)

    const json = await response.json()
    
    const cookieStore = await cookies()
    cookieStore.set("playerId", json.playerId, {
        httpOnly: false, 
        path: "/"
    })

    console.log(`Player ID: ${json.playerId}`)

    redirect(`/quiz`)
  
}


export async function exitQuiz() {
  const cookieStore = await cookies(); // Next 13/14: sync; Next 15: pode ser async (cookies())
  const playerId = cookieStore.get('playerId')?.value;

  if (!playerId) {
    // nada pra fazer; só limpa e retorna ok
    cookieStore.delete('playerId');
    return { ok: true, skipped: true };
  }

  // importante: PathVariable na URL; sem body e sem Content-Type
  const url = `${API_URL}/players/${encodeURIComponent(playerId)}/exit`;
  const response = await fetch(url, { method: 'POST', cache: 'no-store' });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('exitQuiz failed:', response.status, text);
    throw new Error(`Failed to exit quiz (${response.status})`);
  }

  cookieStore.delete('playerId');
  redirect('/'); 
  
}
