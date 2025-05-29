import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { PipelineResponse } from "@/lib/types";

interface ProgressDisplayProps {
  jobId: string | null;
  logs: string[];
  onUpdate: (data: PipelineResponse) => void;
}

export default function ProgressDisplay({ jobId, logs, onUpdate }: ProgressDisplayProps) {
  const [isImageCollapsed, setIsImageCollapsed] = useState(true); // Track if the image section is collapsed
  const [isLogsCollapsed, setIsLogsCollapsed] = useState(true); // Track if the log section is collapsed

  // Update progress based on the logs
  useEffect(() => {
    console.log("ProgressDisplay logs:", logs);
  }, [logs, jobId]);

  // Toggle collapse/expand for image section
  const toggleImageCollapse = () => {
    setIsImageCollapsed((prevState) => !prevState);
  };

  // Toggle collapse/expand for logs section
  const toggleLogsCollapse = () => {
    setIsLogsCollapsed((prevState) => !prevState);
  };

  return (
    <Card className="p-4 mb-2">
      {/* Image Section */}
      <div className="relative cursor-pointer" onClick={toggleImageCollapse}>
        <h2 className="text-lg font-semibold ">Pipeline Overview</h2>
        {/* Collapsible Arrow for Image Section */}
        <div className="absolute top-2 right-2 text-xl">
          {isImageCollapsed ? "↓" : "↑"} {/* Down arrow for collapsed, Up arrow for expanded */}
        </div>
        {!isImageCollapsed && (
          <div className="bg-muted p-2 rounded-md flex justify-center mt-1">
            <img
              src="/pipelineImage.png"
              alt="Pipeline Overview"
              className="max-w-full h-auto max-h-50 object-contain"
            />
          </div>
        )}
      </div>

    

      {/* Pipeline Progress Section */}
      <div className="relative cursor-pointer" onClick={toggleLogsCollapse}>
        <h2 className="text-lg font-semibold mb-2">Pipeline Progress</h2>
        {/* Collapsible Arrow for Logs Section */}
        <div className="absolute top-2 right-2 text-xl">
          {isLogsCollapsed ? "↓" : "↑"} {/* Down arrow for collapsed, Up arrow for expanded */}
        </div>
        {!isLogsCollapsed && (
          <div className="bg-muted p-2 rounded-md max-h-40 overflow-auto">
            {logs.length > 0 ? (
              logs.map((log, index) => (
                <p key={index} className="text-sm">{log}</p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No logs yet.</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}