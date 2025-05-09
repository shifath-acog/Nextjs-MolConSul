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
    // Define temp directory in /app/molconsul-nextjs/temp
    const tempDir = path.join(process.cwd(), "temp"); // cwd is /app/molconsul-nextjs, so this resolves to /app/molconsul-nextjs/temp
    await fs.mkdir(tempDir, { recursive: true });

    // Delete all existing subdirectories in ./temp
    const tempContents = await fs.readdir(tempDir, { withFileTypes: true });
    for (const item of tempContents) {
      if (item.isDirectory()) {
        const itemPath = path.join(tempDir, item.name);
        await fs.rm(itemPath, { recursive: true, force: true });
      }
    }

    // Parse form data
    const formData = await request.formData();
    const smiles = formData.get("smiles")?.toString();
    const sampleSize = parseInt(formData.get("sampleSize")?.toString() || "0", 10);
    const maxEnsembleSize = parseInt(formData.get("maxEnsembleSize")?.toString() || "0", 10);
    const dielectric = parseFloat(formData.get("dielectric")?.toString() || "0");
    const geomOpt = formData.get("geomOpt")?.toString() === "true";
    const refConfoFile = formData.get("refConfoFile") as File | null;

    // Validate inputs
    if (!smiles || isNaN(sampleSize) || sampleSize < 1 || isNaN(maxEnsembleSize) || maxEnsembleSize < 1 || isNaN(dielectric) || dielectric < 0) {
      return NextResponse.json({ error: "Invalid input parameters" }, { status: 400 });
    }

    // Generate unique job ID
    const jobId = uuidv4();

    // Handle reference conformer file if provided
    let refConfoPath: string | undefined;
    let refConfoFileName: string | undefined;
    if (refConfoFile && refConfoFile.name) {
      refConfoFileName = `ref_${jobId}_${refConfoFile.name}`; // Unique name to avoid conflicts
      const filePath = path.join(tempDir, refConfoFileName);
      const fileBuffer = Buffer.from(await refConfoFile.arrayBuffer());
      await fs.writeFile(filePath, fileBuffer);
      refConfoPath = filePath; // Use the absolute path in the container
    }

    // Build the run_pipeline command
    const args = [
      "run",
      "run_pipeline",
      smiles.replace(/'/g, "\\'"), // Escape single quotes in SMILES
      "--num-conf",
      sampleSize.toString(),
      "--num-clusters",
      maxEnsembleSize.toString(),
      "--dielectric-value",
      dielectric.toString(),
      ...(geomOpt ? ["--geom-opt"] : []),
      ...(refConfoPath ? ["--ref-confo-path", refConfoPath] : []),
    ];

    // Set up SSE stream
    const headers = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    };
    const stream = new ReadableStream({
      async start(controller) {
        const logs: string[] = [];
        // Run the command using Poetry to ensure the correct virtual environment
        const childProcess = spawn("poetry", args, { 
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            LD_LIBRARY_PATH: "/opt/conda/lib:" + (process.env.LD_LIBRARY_PATH || ""),
          },
          cwd: "/app", // Run in /app where Poetry is set up
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

        // Collect output files from the temp directory created by run_pipeline
        const outputFiles: string[] = [];
        if (exitCode === 0) {
          // Find the temp_<uuid> directory created by run_pipeline.py
          const tempContentsAfterRun = await fs.readdir(tempDir, { withFileTypes: true });
          const pipelineTempDir = tempContentsAfterRun.find(
            (item) => item.isDirectory() && item.name.startsWith("temp_")
          );

          if (pipelineTempDir) {
            const outputDir = path.join(tempDir, pipelineTempDir.name);
            const clusterDir = path.join(outputDir, "cluster_rep_conformers");
            try {
              // Check if the cluster_rep_conformers directory exists
              await fs.access(clusterDir);
              const clusterFiles = await fs.readdir(clusterDir);
              console.log(`Files in ${clusterDir}:`, clusterFiles);
              for (const file of clusterFiles) {
                if (file.endsWith(".sdf") || file.endsWith(".xyz")) {
                  outputFiles.push(path.join(pipelineTempDir.name, "cluster_rep_conformers", file));
                }
              }

              // Include reference conformer file in outputFiles if uploaded
              if (refConfoFileName) {
                outputFiles.push(refConfoFileName);
              }
            } catch (error) {
              console.error("Failed to read cluster_rep_conformers directory:", error);
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