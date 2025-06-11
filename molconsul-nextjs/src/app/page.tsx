'use client';
import Sidebar from "@/components/Sidebar";
import WorkflowExpander from "@/components/WorkflowExpander";
import ProgressDisplay from "@/components/ProgressDisplay";
import ConformerTabs from "@/components/ConformerTabs";
import { useState } from "react";
import { PipelineResponse } from "@/lib/types";

export default function Home() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [outputFiles, setOutputFiles] = useState<string[]>([]);
  const [geomOpt, setGeomOpt] = useState<boolean>(false); // Added
  const [hasRefConformer, setHasRefConformer] = useState<boolean>(false); // Added

  const handlePipelineStart = (newJobId: string) => {
    setJobId(newJobId);
    setLogs([]);
    setOutputFiles([]);
    setGeomOpt(false); // Reset on new pipeline start
    setHasRefConformer(false); // Reset on new pipeline start
  };

  const handlePipelineUpdate = (data: PipelineResponse | { log: string }) => {
    if ("log" in data) {
      setLogs((prev) => [...prev, data.log]);
    } else {
      setLogs(data.logs);
      setOutputFiles(data.outputFiles || []);
      setGeomOpt(data.geomOpt || false); // Extract geomOpt from response
      setHasRefConformer(data.hasRefConformer || false); // Extract hasRefConformer from response
      if (data.status === "completed" || data.status === "failed") {
        setJobId(null);
      }
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar onPipelineStart={handlePipelineStart} onPipelineUpdate={handlePipelineUpdate} />
      <main className="flex-1 p-6 ml-[350px] max-w-[calc(100%-350px)]">
        <div className="space-y-6">
           <WorkflowExpander />
          <div className="bg-white rounded-lg border border-gray-200 shadow-md p-6">
            <ProgressDisplay jobId={jobId} logs={logs} onUpdate={handlePipelineUpdate} />
          </div>
          {outputFiles.length > 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 shadow-md p-6">
              <ConformerTabs
                outputFiles={outputFiles}
                jobId={jobId || ""}
                geomOpt={geomOpt}
                hasRefConformer={hasRefConformer}
              />
            </div>
          ) : (
            <p className="text-center text-gray-500 mt-6">
              {jobId ? "Running pipeline..." : "Run a pipeline to see conformers"}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}