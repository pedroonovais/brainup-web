
'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Brain } from "lucide-react"
import { startQuiz } from "@/actions"

export default function Home() {


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
            <Brain className="w-8 h-8 text-indigo-600" />
          </div>
          <CardTitle className="text-3xl font-bold text-gray-900">
            BrainUp
          </CardTitle>
          <CardDescription className="text-gray-600">
            Entre com o código da sala para participar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={startQuiz} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="playerName" className="text-sm font-medium text-gray-700">
                Nome de Usuário
              </Label>
              <Input
                id="playerName"
                name="playerName"
                type="text"
                placeholder="Digite seu nome"
                className="w-full"
                required
              />
            </div>
            
            <Button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
              
            >
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
