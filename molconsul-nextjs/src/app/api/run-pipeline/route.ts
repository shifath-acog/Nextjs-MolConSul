import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";

export async function GET(request: Request) {
  console.log("Unexpected GET request to /api/run-pipeline:", {
    url: request.url,
    headers: Object.fromEntries(request.headers),
  });
  return NextResponse.json({ error: "Method GET not allowed. Use POST for pipeline execution." }, { status: 405 });
}

export async function POST(request: Request) {
  try {
    const tempDir = path.join(process.cwd(), "temp");
    await fs.mkdir(tempDir, { recursive: true });

    const tempContents = await fs.readdir(tempDir, { withFileTypes: true });
    for (const item of tempContents) {
      if (item.isDirectory()) {
        const itemPath = path.join(tempDir, item.name);
        await fs.rm(itemPath, { recursive: true, force: true });
      }
    }

    const formData = await request.formData();
    const smiles = formData.get("smiles")?.toString();
    const sampleSize = parseInt(formData.get("sampleSize")?.toString() || "0", 10);
    const maxEnsembleSize = parseInt(formData.get("maxEnsembleSize")?.toString() || "0", 10);
    const dielectric = parseFloat(formData.get("dielectric")?.toString() || "0");
    const geomOpt = formData.get("geomOpt")?.toString() === "true";
    const refConfoFile = formData.get("refConfoFile") as File | null;

    if (!smiles || isNaN(sampleSize) || sampleSize < 1 || isNaN(maxEnsembleSize) || maxEnsembleSize < 1 || isNaN(dielectric) || dielectric < 0) {
      return NextResponse.json({ error: "Invalid input parameters" }, { status: 400 });
    }

    const jobId = uuidv4();
    let refConfoPath: string | undefined;
    let refConfoFileName: string | undefined;
    const hasRefConformer = !!refConfoFile;
    if (refConfoFile && refConfoFile.name) {
      refConfoFileName = `ref_${jobId}_${refConfoFile.name}`;
      const filePath = path.join(tempDir, refConfoFileName);
      const fileBuffer = Buffer.from(await refConfoFile.arrayBuffer());
      await fs.writeFile(filePath, fileBuffer);
      refConfoPath = filePath;
    }

    const args = [
      "run",
      "run_pipeline",
      smiles.replace(/'/g, "\\'"),
      "--num-conf",
      sampleSize.toString(),
      "--num-clusters",
      maxEnsembleSize.toString(),
      "--dielectric-value",
      dielectric.toString(),
      ...(geomOpt ? ["--geom-opt"] : []),
      ...(refConfoPath ? ["--ref-confo-path", refConfoPath] : []),
    ];

    const headers = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    };
    const stream = new ReadableStream({
      async start(controller) {
        const logs: string[] = [];
        const childProcess = spawn("poetry", args, { 
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            LD_LIBRARY_PATH: "/opt/conda/lib:" + (process.env.LD_LIBRARY_PATH || ""),
          },
          cwd: "/app",
        });

        childProcess.stdout.on("data", (data) => {
          const log = data.toString();
          logs.push(log);
          controller.enqueue(`data: ${JSON.stringify({ log })}\n\n`);
        });

        childProcess.stderr.on("data", (data) => {
          const log = data.toString();
          logs.push(log);
          controller.enqueue(`data: ${JSON.stringify({ log })}\n\n`);
        });

        const exitCode = await new Promise<number>((resolve) => {
          childProcess.on("close", (code) => resolve(code ?? 1));
        });

        const outputFiles: string[] = [];
        if (exitCode === 0) {
          const tempContentsAfterRun = await fs.readdir(tempDir, { withFileTypes: true });
          const pipelineTempDir = tempContentsAfterRun.find(
            (item) => item.isDirectory() && item.name.startsWith("temp_")
          );

          if (pipelineTempDir) {
            const outputDir = path.join(tempDir, pipelineTempDir.name);
            const clusterDir = path.join(outputDir, "cluster_rep_conformers");

            try {
              await fs.access(clusterDir);
              const clusterFiles = await fs.readdir(clusterDir);
              console.log(`Files in ${clusterDir}:`, clusterFiles);
              for (const file of clusterFiles) {
                if (file.endsWith(".sdf") || file.endsWith(".xyz")) {
                  outputFiles.push(path.join(pipelineTempDir.name, "cluster_rep_conformers", file));
                }
              }
            } catch (error) {
              console.error("Failed to read cluster_rep_conformers directory:", error);
            }

            try {
              const tempFiles = await fs.readdir(outputDir);
              console.log(`Files in ${outputDir}:`, tempFiles);
              for (const file of tempFiles) {
                if (
                  file === "cluster_rep_conformers_vs_ref_conformer.sdf" ||
                  file.endsWith("cluster_rep_conformers_vs_ref_conformer.sdf") ||
                  file === "cluster_rep_conformers_vs_gen_conformer.sdf" ||
                  (file.includes("rep_of_cluster_") && file.endsWith("_cluster_rep_conformers_vs_gen_conformer.sdf")) // Fixed naming to match actual files
                ) {
                  outputFiles.push(path.join(pipelineTempDir.name, file));
                }
              }
            } catch (error) {
              console.error("Failed to read temp directory for RMSD files:", error);
            }

            if (refConfoFileName) {
              outputFiles.push(refConfoFileName);
            }
          } else {
            console.error("No temp_<uuid> directory found in", tempDir);
          }
        }

        console.log("outputFiles:", outputFiles);
        controller.enqueue(
          `data: ${JSON.stringify({
            status: exitCode === 0 ? "completed" : "failed",
            logs,
            outputFiles,
            jobId,
            geomOpt,
            hasRefConformer,
          })}\n\n`
        );
        controller.close();
      },
    });

    return new NextResponse(stream, { headers });
  } catch (error) {
    console.error("Pipeline error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}