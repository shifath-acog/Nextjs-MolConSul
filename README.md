# MolConSUL

**MolConSUL** is a web application for molecular conformer generation and visualization. It combines a Next.js frontend with a Python pipeline for processing molecular data.

---

## Getting Started

### 1. Clone the Repository

```bash
git clone git@github.com:shifath-acog/Nextjs-MolConSul.git
cd molconsul
```

### 2. Build the Docker Image

Build the container image using the provided Dockerfile:

```bash
docker build -t molconsul-app .
```

### 3. Run the Application

Run the container :
```bash
 docker run -d --gpus all --name molconsul-next-app  molconsul-app
```

### 4. Access the App

Open your browser and navigate to:

```
https://molconsul-next-app.own4.aganitha.ai:8443/
```

---

## Usage

- Enter a SMILES string (e.g., `CCO` for ethanol).
- Set parameters like sample size, conformers, and dielectric.
- Click **"Generate"** to run the pipeline and visualize the 3D molecular structures.



