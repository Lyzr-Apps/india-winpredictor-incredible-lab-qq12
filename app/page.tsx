'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { useLyzrAgentEvents } from '@/lib/lyzrAgentEvents'
import { AgentActivityPanel } from '@/components/AgentActivityPanel'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { IoMdTrophy } from 'react-icons/io'
import { MdSportsCricket } from 'react-icons/md'
import { FiSend, FiRefreshCw, FiChevronDown, FiChevronUp, FiTarget, FiTrendingUp, FiShield, FiAlertTriangle, FiStar, FiZap, FiMessageCircle, FiLoader } from 'react-icons/fi'

// ─── Constants ───────────────────────────────────────────────────────────────

const AGENT_ID = '6996a33d1503e45bac70e455'
const AGENT_NAME = 'India Victory Path Analyst'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SwotData {
  strengths: string
  weaknesses: string
  opportunities: string
  threats: string
}

interface AgentResponseData {
  qualification_probability: string
  nrr_impact: string
  swot: SwotData
  strategy_recommendations: string[]
  scenario_outlook: string
  summary: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  parsedData?: AgentResponseData | null
  timestamp: string
  error?: string
}

// ─── Sample Data ─────────────────────────────────────────────────────────────

const SAMPLE_RESPONSE: AgentResponseData = {
  qualification_probability: "78% -- India needs to win 2 of remaining 3 matches to guarantee a semi-final spot. A single victory combined with favorable NRR could also suffice.",
  nrr_impact: "Current NRR of +1.245 is the second-best in the group. A 30+ run victory against Australia would push NRR above +1.5, virtually guaranteeing qualification even with one loss. However, a close defeat could drop NRR below +0.8, making the final match a must-win.",
  swot: {
    strengths: "**Batting depth** is exceptional with Rohit, Virat, and Shubman providing a rock-solid top order. **Bowling variety** with Bumrah leading the pace attack and Jadeja offering left-arm spin. **Home conditions knowledge** gives India a significant edge in understanding pitch behavior.",
    weaknesses: "**Middle-order consistency** remains a concern with positions 4-6 sometimes struggling under pressure. **Death bowling** has leaked runs in recent matches, especially in the 45-50 over phase. **Over-reliance on top 3** could be exposed against quality new-ball attacks.",
    opportunities: "**Favorable remaining schedule** with two home games provides the best chance to accumulate points. **Other results going India's way** -- if England loses to South Africa, India's qualification becomes nearly certain with just one more win.",
    threats: "**Australia's pace battery** poses the biggest challenge in the next match. **Weather disruptions** could result in washed-out games that deny crucial points. **Injury concerns** around key players could disrupt the winning combination."
  },
  strategy_recommendations: [
    "Prioritize aggressive batting in powerplay overs against Australia to build an early NRR-boosting total -- target 60+ in the first 10 overs.",
    "Rest key fast bowlers strategically across remaining games to ensure peak fitness for the knockout stage.",
    "Deploy a spin-heavy attack in home conditions, using 3 spinners to exploit turning tracks and apply scoreboard pressure.",
    "Bat first whenever possible to set imposing totals that protect and improve the Net Run Rate."
  ],
  scenario_outlook: "India's path to the semi-finals is clear but requires strategic execution. Winning against Australia in the next match would almost clinch qualification with a game to spare. Even a loss can be absorbed if India wins the final group game against Bangladesh, provided NRR stays above +0.9. The ideal scenario: beat Australia by 30+ runs, rest players against South Africa if points are secure, then enter knockouts at full strength.",
  summary: "India are in a commanding position at #2 in the group with 8 points and a stellar NRR of +1.245! Two more wins and the semi-final spot is locked -- and with the form Bumrah and Rohit are in, the championship trophy is well within reach. The Blue Army marches on!"
}

const SAMPLE_MESSAGES: ChatMessage[] = [
  {
    id: 'sample-1',
    role: 'user',
    content: 'What are India\'s chances if they beat Australia by 30+ runs?',
    timestamp: new Date().toISOString()
  },
  {
    id: 'sample-2',
    role: 'agent',
    content: '',
    parsedData: SAMPLE_RESPONSE,
    timestamp: new Date().toISOString()
  }
]

// ─── Scenario Presets ────────────────────────────────────────────────────────

const SCENARIO_PRESETS = [
  "Beat Australia by 30+ runs",
  "Lose to England",
  "Rain washout vs SA",
  "Beat Pakistan by 50 runs",
  "Win all remaining matches",
  "What if NRR drops below 0?"
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## '))
          return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# '))
          return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line))
          return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
  )
}

function parseAgentResponse(result: Record<string, unknown>): AgentResponseData | null {
  let data = result as Record<string, unknown>

  // If result is a string, try to parse it as JSON
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data as string)
    } catch {
      return {
        summary: data as unknown as string,
        qualification_probability: '',
        nrr_impact: '',
        swot: { strengths: '', weaknesses: '', opportunities: '', threats: '' },
        strategy_recommendations: [],
        scenario_outlook: ''
      }
    }
  }

  // If data is still not an object, wrap it
  if (!data || typeof data !== 'object') {
    return null
  }

  // Check if there is nested text or result field that contains JSON
  const possibleJsonFields = ['text', 'response', 'message', 'content', 'answer']
  for (const field of possibleJsonFields) {
    if (typeof (data as Record<string, unknown>)[field] === 'string') {
      try {
        const parsed = JSON.parse((data as Record<string, unknown>)[field] as string)
        if (parsed && typeof parsed === 'object' && (parsed.summary || parsed.qualification_probability || parsed.swot)) {
          data = parsed
          break
        }
      } catch {
        // Not JSON, continue
      }
    }
  }

  const swotRaw = (data as Record<string, unknown>).swot as Record<string, string> | undefined
  const swot: SwotData = {
    strengths: swotRaw?.strengths ?? '',
    weaknesses: swotRaw?.weaknesses ?? '',
    opportunities: swotRaw?.opportunities ?? '',
    threats: swotRaw?.threats ?? ''
  }

  const recs = (data as Record<string, unknown>).strategy_recommendations
  const strategyRecommendations = Array.isArray(recs) ? recs.map(String) : []

  return {
    qualification_probability: String((data as Record<string, unknown>).qualification_probability ?? ''),
    nrr_impact: String((data as Record<string, unknown>).nrr_impact ?? ''),
    swot,
    strategy_recommendations: strategyRecommendations,
    scenario_outlook: String((data as Record<string, unknown>).scenario_outlook ?? ''),
    summary: String((data as Record<string, unknown>).summary ?? '')
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent }: { label: string; value: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <Card className={`border-2 shadow-lg transition-all duration-300 hover:shadow-xl ${accent ? 'border-accent/50 shadow-accent/10' : 'border-border'}`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-muted-foreground text-xs font-semibold tracking-tight uppercase">{label}</span>
          <span className="text-accent">{icon}</span>
        </div>
        <p className={`font-mono text-2xl font-extrabold tracking-tight ${accent ? 'text-accent' : 'text-foreground'}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function SwotSection({ data }: { data: SwotData }) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    strengths: true,
    weaknesses: false,
    opportunities: false,
    threats: false
  })

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const sections = [
    { key: 'strengths', label: 'Strengths', icon: <FiShield className="w-4 h-4" />, color: 'text-green-400', bgColor: 'bg-green-400/10', borderColor: 'border-green-400/30', content: data.strengths },
    { key: 'weaknesses', label: 'Weaknesses', icon: <FiAlertTriangle className="w-4 h-4" />, color: 'text-red-400', bgColor: 'bg-red-400/10', borderColor: 'border-red-400/30', content: data.weaknesses },
    { key: 'opportunities', label: 'Opportunities', icon: <FiStar className="w-4 h-4" />, color: 'text-blue-400', bgColor: 'bg-blue-400/10', borderColor: 'border-blue-400/30', content: data.opportunities },
    { key: 'threats', label: 'Threats', icon: <FiAlertTriangle className="w-4 h-4" />, color: 'text-amber-400', bgColor: 'bg-amber-400/10', borderColor: 'border-amber-400/30', content: data.threats }
  ]

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <FiTarget className="w-4 h-4 text-accent" />
        <h4 className="font-serif font-bold text-sm tracking-tight">SWOT Analysis</h4>
      </div>
      {sections.map((section) => {
        if (!section.content) return null
        return (
          <Collapsible key={section.key} open={openSections[section.key]} onOpenChange={() => toggleSection(section.key)}>
            <CollapsibleTrigger className={`w-full flex items-center justify-between p-3 rounded-lg border-2 ${section.borderColor} ${section.bgColor} transition-all duration-200 hover:shadow-md`}>
              <div className="flex items-center gap-2">
                <span className={section.color}>{section.icon}</span>
                <span className={`font-semibold text-sm ${section.color}`}>{section.label}</span>
              </div>
              {openSections[section.key] ? <FiChevronUp className={`w-4 h-4 ${section.color}`} /> : <FiChevronDown className={`w-4 h-4 ${section.color}`} />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 pl-3 pr-3 pb-1">
              <div className="text-sm text-foreground/90 leading-relaxed">{renderMarkdown(section.content)}</div>
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}

function AgentResponse({ data }: { data: AgentResponseData }) {
  return (
    <div className="space-y-4 w-full">
      {/* Summary */}
      {data.summary && (
        <div className="bg-accent/10 border-2 border-accent/30 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <IoMdTrophy className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
            <div className="text-sm text-foreground leading-relaxed font-medium">{renderMarkdown(data.summary)}</div>
          </div>
        </div>
      )}

      {/* Qualification Probability */}
      {data.qualification_probability && (
        <div className="flex items-start gap-3 bg-card border-2 border-border rounded-xl p-4 shadow-lg">
          <FiZap className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-tight mb-1">Qualification Probability</p>
            <p className="text-sm text-foreground leading-relaxed font-medium">{renderMarkdown(data.qualification_probability)}</p>
          </div>
        </div>
      )}

      {/* NRR Impact */}
      {data.nrr_impact && (
        <div className="flex items-start gap-3 bg-card border-2 border-border rounded-xl p-4 shadow-lg">
          <FiTrendingUp className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-tight mb-1">NRR Impact</p>
            <p className="text-sm text-foreground/90 leading-relaxed">{renderMarkdown(data.nrr_impact)}</p>
          </div>
        </div>
      )}

      {/* SWOT */}
      {data.swot && (data.swot.strengths || data.swot.weaknesses || data.swot.opportunities || data.swot.threats) && (
        <div className="bg-card border-2 border-border rounded-xl p-4 shadow-lg">
          <SwotSection data={data.swot} />
        </div>
      )}

      {/* Strategy Recommendations */}
      {Array.isArray(data.strategy_recommendations) && data.strategy_recommendations.length > 0 && (
        <div className="bg-card border-2 border-border rounded-xl p-4 shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <FiTarget className="w-4 h-4 text-accent" />
            <h4 className="font-serif font-bold text-sm tracking-tight">Strategy Recommendations</h4>
          </div>
          <ol className="space-y-3">
            {data.strategy_recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center font-mono">{idx + 1}</span>
                <span className="text-sm text-foreground/90 leading-relaxed">{renderMarkdown(rec)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Scenario Outlook */}
      {data.scenario_outlook && (
        <div className="flex items-start gap-3 bg-secondary/50 border-2 border-accent/20 rounded-xl p-4 shadow-lg">
          <MdSportsCricket className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-tight mb-1">Scenario Outlook</p>
            <p className="text-sm text-foreground/90 leading-relaxed">{renderMarkdown(data.scenario_outlook)}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="flex gap-1">
        <span className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs text-muted-foreground">Analyzing scenario...</span>
    </div>
  )
}

function EmptyChat() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-4 text-center">
      <div className="w-20 h-20 rounded-full bg-accent/10 border-2 border-accent/30 flex items-center justify-center mb-6">
        <MdSportsCricket className="w-10 h-10 text-accent" />
      </div>
      <h3 className="font-serif text-xl font-bold tracking-tight mb-2 text-foreground">Ask about India's championship path!</h3>
      <p className="text-muted-foreground text-sm max-w-md leading-relaxed">
        Explore qualification scenarios, NRR impact analysis, and strategic recommendations for India's tournament journey. Try clicking a scenario chip above to get started.
      </p>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Page() {
  const [sessionId, setSessionId] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSampleData, setShowSampleData] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [showActivityPanel, setShowActivityPanel] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Agent activity monitoring
  const agentActivity = useLyzrAgentEvents(sessionId || null)

  // Overview stat values derived from latest response
  const [overviewStats, setOverviewStats] = useState({
    position: '#2 in Group',
    points: '8 pts',
    nrr: '+1.245',
    nextMatch: 'vs Australia',
    qualProb: '78%'
  })

  // Initialize session ID on mount
  useEffect(() => {
    setSessionId(crypto.randomUUID())
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Displayed messages (sample or real)
  const displayMessages = showSampleData && messages.length === 0 ? SAMPLE_MESSAGES : messages

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setLoading(true)
    setError(null)
    setActiveAgentId(AGENT_ID)
    agentActivity.setProcessing(true)

    try {
      const result = await callAIAgent(text.trim(), AGENT_ID, {
        user_id: 'user_cricket_fan',
        session_id: sessionId
      })

      if (result.success) {
        let rawData = result?.response?.result
        const parsedData = parseAgentResponse(rawData as Record<string, unknown>)

        // Update overview stats if we got meaningful data
        if (parsedData?.qualification_probability) {
          const probMatch = parsedData.qualification_probability.match(/(\d+)%/)
          if (probMatch) {
            setOverviewStats(prev => ({ ...prev, qualProb: probMatch[1] + '%' }))
          }
        }

        const agentMessage: ChatMessage = {
          id: generateId(),
          role: 'agent',
          content: '',
          parsedData,
          timestamp: new Date().toISOString()
        }

        setMessages(prev => [...prev, agentMessage])
      } else {
        const errMsg = result?.error ?? result?.response?.message ?? 'Failed to get analysis. Please try again.'
        setError(errMsg)
        const errorMessage: ChatMessage = {
          id: generateId(),
          role: 'agent',
          content: '',
          error: errMsg,
          timestamp: new Date().toISOString()
        }
        setMessages(prev => [...prev, errorMessage])
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errMsg)
      const errorMessage: ChatMessage = {
        id: generateId(),
        role: 'agent',
        content: '',
        error: errMsg,
        timestamp: new Date().toISOString()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
      setActiveAgentId(null)
      agentActivity.setProcessing(false)
    }
  }, [loading, sessionId, agentActivity])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(inputValue)
  }

  const handleChipClick = (scenario: string) => {
    setInputValue(scenario)
    sendMessage(scenario)
  }

  const handleReset = () => {
    setMessages([])
    setError(null)
    setInputValue('')
    setSessionId(crypto.randomUUID())
    agentActivity.reset()
    setOverviewStats({
      position: '#2 in Group',
      points: '8 pts',
      nrr: '+1.245',
      nextMatch: 'vs Australia',
      qualProb: '78%'
    })
  }

  const handleRetry = (msg: string) => {
    setError(null)
    sendMessage(msg)
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b-2 border-border bg-card/80 backdrop-blur-sm px-4 md:px-8 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/20 border-2 border-accent/40 flex items-center justify-center shadow-lg shadow-accent/10">
              <MdSportsCricket className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="font-serif text-lg md:text-xl font-extrabold tracking-tight text-foreground">India Victory Path Predictor</h1>
              <p className="text-xs text-muted-foreground tracking-tight">AI-Powered Championship Path Analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground cursor-pointer">Sample Data</Label>
              <Switch id="sample-toggle" checked={showSampleData} onCheckedChange={setShowSampleData} />
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowActivityPanel(!showActivityPanel)} className="border-2 text-xs gap-1.5 hidden md:flex">
              <FiZap className="w-3.5 h-3.5" />
              Activity
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden max-w-5xl w-full mx-auto">

        {/* ── Tournament Overview Panel ──────────────────────────────── */}
        <div className="flex-shrink-0 px-4 md:px-8 pt-5 pb-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Position" value={overviewStats.position} icon={<IoMdTrophy className="w-5 h-5" />} />
            <StatCard label="Points" value={overviewStats.points} icon={<FiStar className="w-4 h-4" />} />
            <StatCard label="Net Run Rate" value={overviewStats.nrr} icon={<FiTrendingUp className="w-4 h-4" />} accent />
            <StatCard label="Next Match" value={overviewStats.nextMatch} icon={<MdSportsCricket className="w-5 h-5" />} />
            <StatCard label="Qual. Probability" value={overviewStats.qualProb} icon={<FiZap className="w-4 h-4" />} accent />
          </div>
        </div>

        {/* ── Scenario Preset Chips ────────────────────────────────── */}
        <div className="flex-shrink-0 px-4 md:px-8 pb-3">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {SCENARIO_PRESETS.map((scenario) => (
              <button
                key={scenario}
                onClick={() => handleChipClick(scenario)}
                disabled={loading}
                className="flex-shrink-0 px-4 py-2 rounded-full border-2 border-accent/30 bg-accent/5 text-xs font-semibold text-accent hover:bg-accent/15 hover:border-accent/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md tracking-tight"
              >
                {scenario}
              </button>
            ))}
          </div>
        </div>

        <Separator className="mx-4 md:mx-8" />

        {/* ── Chat Interface ───────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1 px-4 md:px-8">
            <div className="py-4 space-y-5">
              {displayMessages.length === 0 && !loading ? (
                <EmptyChat />
              ) : (
                <>
                  {displayMessages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'user' ? (
                        <div className="max-w-[85%] md:max-w-[70%]">
                          <div className="bg-accent text-accent-foreground px-4 py-3 rounded-2xl rounded-br-sm shadow-lg border-2 border-accent/80">
                            <p className="text-sm font-medium">{msg.content}</p>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1 text-right tracking-tight">You</p>
                        </div>
                      ) : (
                        <div className="max-w-[95%] md:max-w-[85%]">
                          <div className="flex items-start gap-2">
                            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center mt-1">
                              <MdSportsCricket className="w-3.5 h-3.5 text-accent" />
                            </div>
                            <div className="flex-1">
                              {msg.error ? (
                                <div className="bg-destructive/10 border-2 border-destructive/30 rounded-2xl rounded-bl-sm p-4">
                                  <div className="flex items-center gap-2 mb-2">
                                    <FiAlertTriangle className="w-4 h-4 text-destructive" />
                                    <span className="text-sm font-semibold text-destructive">Analysis Error</span>
                                  </div>
                                  <p className="text-sm text-foreground/80 mb-3">{msg.error}</p>
                                  <Button variant="outline" size="sm" className="border-2 text-xs" onClick={() => { const lastUserMsg = messages.filter(m => m.role === 'user').pop(); if (lastUserMsg) handleRetry(lastUserMsg.content); }}>
                                    <FiRefreshCw className="w-3 h-3 mr-1.5" />
                                    Retry
                                  </Button>
                                </div>
                              ) : msg.parsedData ? (
                                <div className="bg-card border-2 border-border rounded-2xl rounded-bl-sm p-4 shadow-lg">
                                  <AgentResponse data={msg.parsedData} />
                                </div>
                              ) : msg.content ? (
                                <div className="bg-card border-2 border-border rounded-2xl rounded-bl-sm p-4 shadow-lg">
                                  <div className="text-sm text-foreground/90 leading-relaxed">{renderMarkdown(msg.content)}</div>
                                </div>
                              ) : null}
                              <p className="text-[10px] text-muted-foreground mt-1 tracking-tight">{AGENT_NAME}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center mt-1">
                          <FiLoader className="w-3.5 h-3.5 text-accent animate-spin" />
                        </div>
                        <div className="bg-card border-2 border-border rounded-2xl rounded-bl-sm shadow-lg">
                          <TypingIndicator />
                          {agentActivity.lastThinkingMessage && (
                            <div className="px-4 pb-3">
                              <p className="text-xs text-muted-foreground italic truncate max-w-xs">{agentActivity.lastThinkingMessage}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>

          {/* ── Input Bar ─────────────────────────────────────────── */}
          <div className="flex-shrink-0 border-t-2 border-border bg-card/80 backdrop-blur-sm px-4 md:px-8 py-4">
            <form onSubmit={handleSubmit} className="flex items-center gap-3 max-w-3xl mx-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="border-2 text-xs flex-shrink-0 gap-1.5"
                title="New Scenario"
              >
                <FiRefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New</span>
              </Button>
              <div className="flex-1 relative">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask about India's path to the title..."
                  disabled={loading}
                  className="pr-12 border-2 bg-background/50 text-sm h-11 rounded-xl focus:border-accent"
                />
              </div>
              <Button
                type="submit"
                disabled={loading || !inputValue.trim()}
                className="bg-accent text-accent-foreground hover:bg-accent/90 border-2 border-accent shadow-lg shadow-accent/20 h-11 px-5 rounded-xl font-semibold text-sm gap-2 transition-all duration-200"
              >
                {loading ? (
                  <FiLoader className="w-4 h-4 animate-spin" />
                ) : (
                  <FiSend className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Ask</span>
              </Button>
            </form>
            {error && (
              <div className="mt-2 max-w-3xl mx-auto">
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <FiAlertTriangle className="w-3 h-3 flex-shrink-0" />
                  {error}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Agent Activity Panel (Slide-out) ──────────────────────── */}
      {showActivityPanel && (
        <div className="fixed top-0 right-0 h-full w-96 max-w-[90vw] bg-card border-l-2 border-border shadow-2xl z-50 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b-2 border-border">
            <h3 className="font-serif font-bold text-sm tracking-tight">Agent Activity</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowActivityPanel(false)} className="text-xs">
              Close
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <AgentActivityPanel
              isConnected={agentActivity.isConnected}
              events={agentActivity.events}
              thinkingEvents={agentActivity.thinkingEvents}
              lastThinkingMessage={agentActivity.lastThinkingMessage}
              activeAgentId={agentActivity.activeAgentId}
              activeAgentName={agentActivity.activeAgentName}
              isProcessing={agentActivity.isProcessing}
            />
          </div>
        </div>
      )}

      {/* ── Agent Info Footer ─────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t-2 border-border bg-card/50 px-4 py-2">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${activeAgentId ? 'bg-green-400 animate-pulse' : 'bg-muted-foreground/40'}`} />
              <span className="text-[10px] text-muted-foreground font-mono tracking-tight">{AGENT_NAME}</span>
            </div>
            <Badge variant="outline" className="text-[10px] px-2 py-0 border-border">
              {activeAgentId ? 'Processing' : 'Ready'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <FiMessageCircle className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-mono">{messages.filter(m => m.role === 'user').length} queries</span>
          </div>
        </div>
      </div>
    </div>
  )
}
