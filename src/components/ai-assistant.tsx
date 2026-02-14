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
  FileText,
} from "lucide-react";
import { useState } from "react";

interface AiAssistantProps {
  customer: string;
}

const reasonDotColors: Record<string, string> = {
  "Repeated Error 500": "bg-red-500",
  "Similar past L2 case": "bg-green-500",
  "Enterprise SLA Impact": "bg-amber-500",
};

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
          <Card className="gap-0 py-0 border-l-4 border-l-red-500 shadow-sm hover:shadow-md transition-shadow duration-150">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer px-3 py-2.5 bg-red-50/50 rounded-tr-md">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  <span className="text-red-600">Escalation Suggested</span>
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
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          reasonDotColors[reason.label] ?? "bg-zinc-400"
                        }`}
                      />
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
          <Card className="gap-0 py-0 shadow-sm hover:shadow-md transition-shadow duration-150">
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
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md border border-gray-200 px-2.5 py-2 text-xs hover:bg-gray-50 transition-colors duration-150"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <div className="flex-1 min-w-0">
                      <span className="text-zinc-500">
                        {article.type === "guide" ? "Guide:" : "Incident #443:"}
                      </span>{" "}
                      <a
                        href={article.link}
                        className="text-blue-600 hover:underline"
                      >
                        {article.label}
                      </a>
                    </div>
                  </div>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Escalation Packet */}
        <Collapsible open={packetOpen} onOpenChange={setPacketOpen}>
          <Card className="gap-0 py-0 shadow-sm hover:shadow-md transition-shadow duration-150">
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
              <CardContent className="px-3 pb-3 pt-0">
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="rounded-md bg-zinc-50 p-2 text-center">
                    <p className="text-[10px] text-zinc-500">Customer</p>
                    <p className="text-xs font-medium text-zinc-800">{customer}</p>
                  </div>
                  <div className="rounded-md bg-zinc-50 p-2 text-center">
                    <p className="text-[10px] text-zinc-500">Workflow</p>
                    <p className="text-xs font-medium text-zinc-800">Bot Process X</p>
                  </div>
                  <div className="rounded-md bg-zinc-50 p-2 text-center">
                    <p className="text-[10px] text-zinc-500">Status</p>
                    <p className="text-xs font-medium text-zinc-800">Logs Attached</p>
                  </div>
                </div>
                <div className="flex gap-2">
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
