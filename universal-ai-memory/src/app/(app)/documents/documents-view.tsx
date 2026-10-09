"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, NotebookPen, Plus } from "lucide-react";
import { useAddToMemory } from "@/components/app/add-dialog";
import { FileManager } from "@/components/app/file-manager";
import { NotesPanel } from "@/components/app/notes-panel";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/overlay";

export function DocumentsView() {
  const params = useSearchParams();
  const router = useRouter();
  const { openAdd } = useAddToMemory();
  const tab = params.get("tab") === "notes" || params.get("note") ? "notes" : "files";
  return (
    <div>
      <PageHeader
        title="Documents"
        description="PDFs, Office files, spreadsheets, text and code, plus the notes you write."
        actions={tab === "files" ? <Button onClick={() => openAdd("files")}><Plus className="h-4 w-4" aria-hidden />Add files</Button> : <Button onClick={() => openAdd("note")}><Plus className="h-4 w-4" aria-hidden />New note</Button>}
      />
      <Tabs value={tab} onValueChange={(v) => router.replace(v === "notes" ? "/documents?tab=notes" : "/documents")}>
        <TabsList className="mb-5"><TabsTrigger value="files"><FileText className="h-3.5 w-3.5" aria-hidden />Documents</TabsTrigger><TabsTrigger value="notes"><NotebookPen className="h-3.5 w-3.5" aria-hidden />Notes</TabsTrigger></TabsList>
      </Tabs>
      {tab === "files" ? <FileManager title="Documents" description="" categories={["document", "data", "code"]} hideHeader extraViews={false} /> : <NotesPanel initialId={params.get("note")} />}
    </div>
  );
}
