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
    const cookieStore = await cookies()
    const playerId = cookieStore.get("playerId")?.value

    if (!playerId) {
        console.log('No player ID found in cookies.')
        redirect('/')
        return
    }

    console.log(`Exiting quiz for player ID: ${playerId}`)

    const response = await fetch(`${API_URL}/players/exit`, {
        method: 'POST',
        body: JSON.stringify({ playerId }),
        headers: {
            'Content-Type': 'application/json'
        }
    })
    if (!response?.ok) throw new Error(`Failed to exit quiz (${response.status})`)

    cookieStore.delete("playerId")

    redirect('/')
}

