import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MolecularViewer from "./MolecularViewer";
import Molecule2DViewer from "./Molecule2DViewer";

interface ConformerTabsProps {
  outputFiles: string[];
  jobId: string;
  geomOpt: boolean;
  hasRefConformer: boolean;
}

export default function ConformerTabs({ outputFiles, jobId, geomOpt, hasRefConformer }: ConformerTabsProps) {
  const [isJSZipLoaded, setIsJSZipLoaded] = useState(false);
  const [selectedSdfFile, setSelectedSdfFile] = useState<string | null>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      setIsJSZipLoaded(true);
      console.log("JSZip loaded successfully");
    };

    script.onerror = () => {
      console.error("Failed to load JSZip");
    };

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  // Categorize output files
  const sdfFiles: string[] = [];
  const xyzFiles: string[] = [];
  let refConformer: string | null = null;
  let clusterRepVsRef: string | null = null;
  let clusterRepVsGen: string | null = null;
  const perClusterVsRef: string[] = [];
  const perClusterVsGen: string[] = [];
  let repCluster1Sdf: string | null = null;
  let repCluster1Xyz: string | null = null;

  if (Array.isArray(outputFiles)) {
    outputFiles.forEach((file) => {
      if (file.includes("cluster_rep_conformers")) {
        if (file.endsWith(".sdf") && file.includes("cluster_rep_conformers_vs_ref_conformer.sdf") && !file.includes("rep_of_cluster_")) {
          clusterRepVsRef = file;
        } else if (file.endsWith(".sdf") && file.includes("cluster_rep_conformers_vs_gen_conformer.sdf") && !file.includes("rep_of_cluster_")) {
          clusterRepVsGen = file;
        } else if (file.includes("rep_of_cluster_") && file.endsWith("_cluster_rep_conformers_vs_ref_conformer.sdf")) {
          perClusterVsRef.push(file);
        } else if (file.includes("rep_of_cluster_") && file.endsWith("_cluster_rep_conformers_vs_gen_conformer.sdf")) {
          perClusterVsGen.push(file);
        } else if (file.endsWith(".sdf") && !file.includes("vs_ref_conformer") && !file.includes("vs_gen_conformer")) {
          sdfFiles.push(file);
          if (file.includes("rep_of_cluster_1.sdf")) {
            repCluster1Sdf = file;
          }
        } else if (file.endsWith(".xyz")) {
          xyzFiles.push(file);
          if (file.includes("rep_of_cluster_1.xyz")) {
            repCluster1Xyz = file;
          }
        }
      } else if (file.endsWith(".sdf") || file.endsWith(".mol2") || file.endsWith(".pdb") || file.endsWith(".xyz")) {
        refConformer = file;
      }
    });
  }

  useEffect(() => {
    if (sdfFiles.length > 0 && !selectedSdfFile) {
      setSelectedSdfFile(sdfFiles[0]);
    }
  }, [sdfFiles, selectedSdfFile]);

  const handleDownloadFile = async (filePath: string) => {
    try {
      const encodedPath = encodeURIComponent(filePath);
      const fetchUrl = `/api/files/${encodedPath}`;
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${fetchUrl}: ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filePath.split("/").pop() || "conformer.sdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error(`Error downloading file ${filePath}:`, error.message);
      alert(`Failed to download file: ${error.message}`);
    }
  };

  const handleDownloadAllXyz = async () => {
    if (!isJSZipLoaded || !window.JSZip) {
      alert("JSZip is not loaded. Please try again later.");
      return;
    }

    const zip = new window.JSZip();
    try {
      for (const filePath of xyzFiles) {
        const encodedPath = encodeURIComponent(filePath);
        const fetchUrl = `/api/files/${encodedPath}`;
        const response = await fetch(fetchUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${fetchUrl}: ${response.status} ${response.statusText}`);
        }
        const fileContent = await response.text();
        const fileName = filePath.split("/").pop() || "conformer.xyz";
        zip.file(fileName, fileContent);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `conformers_${jobId}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Error creating ZIP file:", error.message);
      alert(`Failed to download ZIP file: ${error.message}`);
    }
  };

  return (
    <Tabs defaultValue="reference" className="w-full">
      <TabsList className="grid w-full grid-cols-3 gap-2 bg-gray-100 p-2 rounded-lg shadow-sm">
        <TabsTrigger value="reference" className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
          Reference Conformer
        </TabsTrigger>
        <TabsTrigger value="individual" className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
          Individual Conformers
        </TabsTrigger>
        <TabsTrigger value="all" className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
          All Conformers
        </TabsTrigger>
      </TabsList>
      <TabsContent value="reference" className="mt-4">
        {refConformer ? (
          <div className="flex flex-col md:flex-row items-center gap-6 p-6 bg-white rounded-lg border border-gray-200 shadow-md">
            <div className="w-full md:w-[300px] h-[300px] flex items-center justify-center border border-gray-200 rounded-md">
              <Molecule2DViewer filePath={refConformer} />
            </div>
            <div className="w-full md:w-[300px] h-[300px] flex items-center justify-center border border-gray-200 rounded-md">
              <MolecularViewer files={[refConformer]} height="100%" width="100%" />
            </div>
          </div>
        ) : (
          <p className="text-center text-gray-500 py-4">No conformer found</p>
        )}
      </TabsContent>
      <TabsContent value="individual" className="mt-4">
        {sdfFiles.length > 0 ? (
          <div className="p-6 bg-white rounded-lg border border-gray-200 shadow-md">
            {selectedSdfFile && (
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <label htmlFor="conformer-select" className="text-sm font-medium text-gray-700">
                    Select Conformer:
                  </label>
                  <select
                    id="conformer-select"
                    value={selectedSdfFile || ""}
                    onChange={(e) => setSelectedSdfFile(e.target.value)}
                    className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {sdfFiles.map((file) => (
                      <option key={file} value={file}>
                        {file.split("/").pop()?.replace(".sdf", "")}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => handleDownloadFile(selectedSdfFile)}
                  className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition shadow-sm"
                >
                  Download SDF
                </button>
              </div>
            )}
            {selectedSdfFile && (
              <div className="flex flex-col md:flex-row justify-center items-center gap-6">
                <div className="w-full md:w-[300px] h-[300px] flex items-center justify-center border border-gray-200 rounded-md shadow-sm">
                  <Molecule2DViewer filePath={selectedSdfFile} />
                </div>
                <div className="w-full md:w-[300px] h-[300px] flex items-center justify-center border border-gray-200 rounded-md shadow-sm">
                  <MolecularViewer files={[selectedSdfFile]} height="100%" width="100%" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-center text-gray-500 py-4">No individual conformers found</p>
        )}
      </TabsContent>
      <TabsContent value="all" className="mt-4">
        {(() => {
          let filesToRender: string[] = [];
          if (!hasRefConformer && !geomOpt) {
            filesToRender = [repCluster1Sdf!, ...perClusterVsGen].filter(Boolean); // Use perClusterVsGen for Scenario 1
          } else if (hasRefConformer && !geomOpt) {
            filesToRender = [refConformer!, ...(perClusterVsRef.length > 0 ? perClusterVsRef : [clusterRepVsRef!])].filter(Boolean);
          } else if (hasRefConformer && geomOpt) {
            filesToRender = [refConformer!, ...(perClusterVsRef.length > 0 ? perClusterVsRef : [clusterRepVsRef!])].filter(Boolean);
          } else if (!hasRefConformer && geomOpt) {
            filesToRender = [repCluster1Xyz!, ...(perClusterVsGen.length > 0 ? perClusterVsGen : [clusterRepVsGen!])].filter(Boolean);
          }

          console.log("All Conformers tab - Files being rendered:", filesToRender);

          if (filesToRender.length === 0) {
            return (
              <p className="text-center text-gray-500 py-4">
                No conformers to display
                <br />
                Scenario Debug: hasRefConformer={hasRefConformer ? "True" : "False"}, geomOpt={geomOpt ? "True" : "False"}
              </p>
            );
          }

          return (
            <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-lg border border-gray-200 shadow-md">
              <div className="w-full h-[400px] border border-gray-200 rounded-md shadow-sm">
                <MolecularViewer files={filesToRender} height="100%" width="100%" />
              </div>
              {(hasRefConformer || geomOpt) && xyzFiles.length > 0 && (
                <button
                  onClick={handleDownloadAllXyz}
                  className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition shadow-sm"
                  disabled={!isJSZipLoaded}
                >
                  {isJSZipLoaded ? "Download All XYZ as ZIP" : "Loading JSZip..."}
                </button>
              )}
            </div>
          );
        })()}
      </TabsContent>
    </Tabs>
  );
}