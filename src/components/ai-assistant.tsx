import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { escalationReasons, knowledgeArticles } from "@/data/dummy-data";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  FileText,
  User,
  FileCode,
  CheckSquare,
} from "lucide-react";
import { useState } from "react";

interface AiAssistantProps {
  customer: string;
}

export function AiAssistant({ customer }: AiAssistantProps) {
  const [escalationOpen, setEscalationOpen] = useState(true);
  const [knowledgeOpen, setKnowledgeOpen] = useState(true);
  const [packetOpen, setPacketOpen] = useState(true);

  return (
    <div className="flex h-full w-[300px] flex-col border-l bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">AI Assistant</h2>
        <ChevronDown className="h-4 w-4 text-zinc-400" />
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Escalation Suggested */}
        <Collapsible open={escalationOpen} onOpenChange={setEscalationOpen}>
          <Card className="gap-0 py-0">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer px-3 py-2.5">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  <span className="text-orange-600">Escalation Suggested</span>
                  {escalationOpen ? (
                    <ChevronUp className="h-4 w-4 text-zinc-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-zinc-400" />
                  )}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="px-3 pb-3 pt-0">
                <p className="mb-2 text-xs text-zinc-500">
                  Reason for Escalation:
                </p>
                <ul className="space-y-1.5">
                  {escalationReasons.map((reason, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 text-xs text-zinc-700"
                    >
                      <span>{reason.icon}</span>
                      <span>{reason.label}</span>
                    </li>
                  ))}
                </ul>
                <Button className="mt-3 w-full" size="sm">
                  Escalate to Level 2
                </Button>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Related Knowledge */}
        <Collapsible open={knowledgeOpen} onOpenChange={setKnowledgeOpen}>
          <Card className="gap-0 py-0">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer px-3 py-2.5">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  Related Knowledge
                  {knowledgeOpen ? (
                    <ChevronUp className="h-4 w-4 text-zinc-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-zinc-400" />
                  )}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="px-3 pb-3 pt-0 space-y-2">
                {knowledgeArticles.map((article, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {article.type === "guide" ? (
                      <Plus className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-zinc-500" />
                    )}
                    <span className="text-zinc-500">
                      {article.type === "guide" ? "Guide:" : "Incident #443:"}
                    </span>
                    <a
                      href={article.link}
                      className="text-blue-600 hover:underline"
                    >
                      {article.label}
                    </a>
                  </div>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Escalation Packet */}
        <Collapsible open={packetOpen} onOpenChange={setPacketOpen}>
          <Card className="gap-0 py-0">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer px-3 py-2.5">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  Escalation Packet
                  {packetOpen ? (
                    <ChevronUp className="h-4 w-4 text-zinc-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-zinc-400" />
                  )}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="px-3 pb-3 pt-0 space-y-2">
                <div className="flex items-center gap-2 text-xs text-zinc-700">
                  <User className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-zinc-500">Customer:</span>
                  <span className="font-medium">{customer}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-700">
                  <FileCode className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-zinc-500">Workflow:</span>
                  <span className="font-medium">Bot Process X</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-700">
                  <CheckSquare className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Error Logs Attached</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="text-xs">
                    Edit Details
                  </Button>
                  <Button size="sm" className="text-xs">
                    Escalate to L2
                  </Button>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </div>
  );
}
