# **Conformer Generation Pipeline User Manual**

---

## **NAME**
**run_pipeline** – A utility for generating, optimizing, and analyzing 3D molecular conformers from SMILES or reference conformer files.

---

## **SYNOPSIS**
```bash
run_pipeline [REF_CONFO_PATH] [SMILES] [OPTIONS]
```

---

## **DESCRIPTION**
The `run_pipeline` utility processes chemical structures into 3D conformers. It optimizes conformers, clusters them based on structural similarity, and analyzes energy and geometry.

### **Key Features:**
- Generates 3D conformers using SMILES from the reference conformer.
- Optimizes conformers and sorts them by energy.
- Clusters conformers based on RMSD (Root Mean Square Deviation).
- Outputs detailed analysis in `.sdf` and `.csv` formats.

---

## **OPTIONS**
- **`[REF_CONFO_PATH]`**  
  Path to the reference conformer file (e.g., `.xyz`).  

- **`[SMILES]`**  
  The chemical structure in SMILES format.  

- **`--num-conf [INTEGER]`**  
  Number of conformers to generate.  

- **`--num-clusters [INTEGER]`**  
  Number of clusters to generate from conformers.  

---

## **PRIMARIES**
### **Pipeline Steps**
1. **Input Validation**:  
   Verifies the reference conformer path and input SMILES string.
2. **Conformer Generation**:  
   Creates 3D molecular conformers using RDKit.
3. **Optimization**:  
   Optimizes conformers using MMFF94 force fields and sorts them by energy.
4. **Clustering**:  
   Clusters conformers based on pairwise RMSD similarity.
5. **Representative Selection**:  
   Selects minimum-energy representatives for each cluster.
6. **Output**:  
   Generates `.sdf` and `.csv` files with sorted conformers, energies, and clustering details.

---

## **COMPATIBILITY**
- Python Version: 3.7+
- RDKit: 2023.09.1+  
- Works on Linux systems.

---

## **STANDARDS**
This utility adheres to open standards for SMILES input and chemical file outputs (`.sdf` and `.xyz` formats). Compatibility with standard molecular modeling tools is maintained.

---

## **EXAMPLES**

### **Example 1: Basic Command**
Generate and analyze 1000 conformers clustered into 20 groups.
```bash
run_pipeline "/path/to/reference_conformer.xyz" "CC(=O)OCC[N+](C)(C)C" --num-conf 1000 --num-clusters 20
```

**Output Files:**
- `optimized_conformers.sdf`: All generated conformers.
- `sorted_optimized_conformers.sdf`: Conformers sorted by energy.
- `cluster_representatives.sdf`: Representative conformers for each cluster.
- `cluster_representatives.csv`: Metadata for representatives.

---

### **Example 2: Custom Number of Conformers**
Generate 500 conformers and cluster them into 10 groups.
```bash
run_pipeline "/path/to/reference_conformer.xyz" "CCO" --num-conf 500 --num-clusters 10
```

**Output Description:**
- Conformers representing the molecule `CCO`.
- Clustering results reduced to 10 representative groups.

---

### **Example 3: Analyze Larger Cluster Groups**
Generate 2000 conformers and cluster them into 50 groups.
```bash
run_pipeline "/path/to/reference_structure.xyz" "C1=CC=CC=C1" --num-conf 2000 --num-clusters 50
```

**Use Case:**
For complex molecules, a higher number of clusters is useful for detailed geometric diversity analysis.

---

### **Example 5: Test with Provided Sample File**
Use the pre-prepared reference conformer file to test the pipeline.
```bash
run_pipeline "test_data/sample_reference_conformer.xyz" "CC(=O)OC1=CC=CC=C1C(=O)O" --num-conf 1000 --num-clusters 20
```

**Output Location:**
The output files will be created in the working directory, matching the naming conventions described earlier.

---

These examples demonstrate how to adjust input parameters for various use cases, from quick tests to detailed conformer analysis.

---
