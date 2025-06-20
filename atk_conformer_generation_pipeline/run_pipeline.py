import sys
import os
import shutil
import time
from typing import *
from atk_conformer_generation_pipeline.utils import *
from atk_conformer_generation_pipeline.variables import *
import pandas as pd
from rdkit import Chem
import numpy as np
from scipy.spatial.distance import squareform, is_valid_dm
from scipy.cluster.hierarchy import fcluster
import scipy.cluster.hierarchy as sch
import typer
from termcolor import colored
import uuid
import glob
from pyscf import gto
from pyscf.geomopt import geometric_solver
from gpu4pyscf.dft import rks
from pyscf.hessian import thermo

app = typer.Typer()


def get_atom_list(sdf_file):
    molecules = Chem.SDMolSupplier(sdf_file, removeHs=False)
    mol = next(molecules)  # Assuming you have one molecule in the SDF

    # Get the first conformer to access 3D coordinates
    conformer = mol.GetConformer()

    # Extract atomic symbols and coordinates
    atom_list = []
    for atom in mol.GetAtoms():
        pos = conformer.GetAtomPosition(atom.GetIdx())
        atom_list.append((atom.GetSymbol(), (pos.x, pos.y, pos.z)))
    return atom_list


def opti_PCM(mol, eps, xyz_filename):
    start_time = time.time()
    # Set up the DFT calculation
    mf = rks.RKS(mol).density_fit()  # Use density fitting for efficiency
    mf.xc = "M06-2X"  # Set the exchange-correlation functional

    # SCF convergence Criteria
    mf.conv_tol = 1e-8  # Energy convergence
    mf.conv_tol_grad = 3e-4  # Gradient convergence
    mf.max_cycle = 70  # Increase max iterations if needed

    # Apply the solvation model
    mf = mf.PCM()  # Initialize solvation model
    mf.grids.atom_grid = (99, 590)
    mf.with_solvent.lebedev_order = 29  # 302 Lebedev grids
    mf.with_solvent.method = 'IEF-PCM'  # Can be C-PCM, SS(V)PE, COSMO
    mf.with_solvent.eps = eps  # Set the solvent's dielectric constant

    # Perform geometry optimization
    print("Starting geometry optimization...")
    mol_opt = geometric_solver.optimize(mf, max_steps=200, xtol=1e-8, gtol=3e-4, etol=1e-8)

    # Ensure SCF calculation is performed
    mf.kernel()

    # Output optimized geometry
    optimized_atoms = [(atom[0], mol_opt.atom_coords(unit='Angstrom')[i]) for i, atom in enumerate(mol_opt.atom)]

    # Extract the final energy in Hartree
    final_energy_hartree = mf.e_tot

    # Convert energy from Hartree to kJ/mol
    hartree_to_kjmol = 2625.5
    final_energy_kjmol = final_energy_hartree * hartree_to_kjmol

    # Save optimized geometry to XYZ file
    with open(xyz_filename, 'w') as xyz_file:
        xyz_file.write(f"{len(optimized_atoms)}\n")
        xyz_file.write(f"Energy: {final_energy_kjmol:.2f} kJ/mol\n")
        for symbol, coords in optimized_atoms:
            formatted_coords = ' '.join(f"{coord:.8f}" for coord in coords)
            xyz_file.write(f"{symbol} {formatted_coords}\n")

    print(f"Optimized geometry saved to '{xyz_filename}'.")

    # Print the final energy
    print(f"Final energy: {final_energy_hartree:.8f} Hartree ({final_energy_kjmol:.2f} kJ/mol)")

    # Record the end time
    opt_time = time.time()

    # Calculate and print the total run time
    total_opt_time = opt_time - start_time
    print(f"\nOPT Time: {total_opt_time:.2f} seconds")

    print("################################################################")
    return mol_opt

def step1_input_and_verify(ref_confo_path: str = None) -> Tuple[str, str]:
    """
    Step 1: Verify the input SMILES and reference conformer path, and set up the working directory.

    Args:
        ref_confo_path (str): The file path to the reference conformer.

    Returns:
        Tuple[str, str]: The absolute path of the reference conformer and the created output directory.
    """
    print(colored("Step 1: Taking Input SMILES and Reference Conformer", "cyan"))

    # Check if the path is relative or absolute
    if ref_confo_path is not None:
        if not os.path.isabs(ref_confo_path):
        # If the path is relative, convert it to absolute
            ref_confo_path = os.path.abspath(ref_confo_path)
    
        if not os.path.exists(ref_confo_path):
            print(f"Error: The path '{ref_confo_path}' does not exist.")
            sys.exit(1)  # Exit the program with a status code of 1 (indicating an error)

    # Create a temporary output directory
    base_temp_dir = "/app/molconsul-nextjs/temp"
    output_dir = os.path.join(base_temp_dir, f"temp_{uuid.uuid4()}")
    os.makedirs(output_dir, exist_ok=True)
    os.chdir(output_dir)
    
    # Set recursion limit for deep recursion needs
    sys.setrecursionlimit(10000)

    return ref_confo_path, output_dir


def step2_generate_conformers(inp_smiles: str, num_conf: int, init_conf_sdf: str) -> Chem.Mol:
    """
    Step 2: Generate conformers using the RDKit-ETKDG method and save them to an SDF file.

    Args:
        inp_smiles (str): The input SMILES string representing the chemical structure.
        num_conf (int): The number of conformers to generate.
        init_conf_sdf (str): The path to save the generated conformers in SDF format.

    Returns:
        Chem.Mol: The RDKit molecule object with generated conformers.
    """
    print(colored("Step 2: Generating Conformers using the RDKit-ETKDG method", "cyan"))

    # Generate conformers using the provided SMILES and number of conformers
    mol: Chem.Mol = generate_conformers(inp_smiles, num_conf)
    
    # Save the generated conformers to an SDF file
    save_conformers_to_sdf(mol, init_conf_sdf)

    return mol


def step3_optimize_conformers(
    mol: Chem.Mol,
    opt_conf_sdf: str,
    opt_conf_energy_csv: str,
    opt_conf_SMILES_file: str,
    feasible_geometries_sdf: str,
    infeasible_geometries_sdf: str,
    similarity_output_csv: str,
    infeasible_geometries_csv: str,
    inp_smiles: str,
    feasible_geometries_csv: str
) -> Tuple[int, int, pd.DataFrame]:
    """
    Step 3: Optimize the generated conformers, save the optimized coordinates, and process the conformers.

    Args:
        mol (Chem.Mol): The RDKit molecule object with generated conformers.
        opt_conf_sdf (str): Path to save the optimized conformers in SDF format.
        opt_conf_energy_csv (str): Path to save the conformer energies in CSV format.
        opt_conf_SMILES_file (str): Path to save the SMILES representations of optimized conformers.
        feasible_geometries_sdf (str): Path to save feasible geometries in SDF format.
        infeasible_geometries_sdf (str): Path to save infeasible geometries in SDF format.
        similarity_output_csv (str): Path to save the similarity results in CSV format.
        infeasible_geometries_csv (str): Path to save infeasible geometries in CSV format.
        inp_smiles (str): The input SMILES string for reference.
        feasible_geometries_csv (str): Path to save feasible geometries CSV file.

    Returns:
        Tuple[int, int, pd.DataFrame]: Number of feasible conformers, number of infeasible conformers, and DataFrame of relative energies.
    """
    print(colored("Step 3: Optimizing Conformers", "cyan"))

    # Optimize the generated conformers
    opt_mol, conformer_energies = mmff_optimize_conformers(mol)
    
    # Save the optimized conformers to an SDF file
    save_conformers_to_sdf(opt_mol, opt_conf_sdf)
    
    # Get the number of optimized conformers
    num_opt_conf: int = opt_mol.GetNumConformers()

    # Save the energies of optimized conformers to a CSV file
    conformer_energies_items: List[Tuple[int, float]] = list(conformer_energies.items())
    energy_DF: pd.DataFrame = pd.DataFrame(conformer_energies_items, columns=['conformer_id', 'energy_in_kcalpermol'])
    energy_DF.to_csv(opt_conf_energy_csv, index=False)

    # Convert the 3D geometries of conformers into SMILES and save them
    convert_conformers_to_smiles(opt_conf_sdf, opt_conf_SMILES_file)

    # Process optimized conformers to calculate Tanimoto similarity and separate feasible and infeasible geometries
    infeasible_geom_DF, energy_DF = process_conformers(
        opt_conf_SMILES_file,
        opt_conf_sdf,
        feasible_geometries_sdf,
        infeasible_geometries_sdf,
        similarity_output_csv,
        infeasible_geometries_csv,
        inp_smiles,
        num_opt_conf,
        energy_DF
    )

    # Calculate the number of conformers with feasible and infeasible geometries
    num_feasible_geom: int = len(energy_DF)
    num_infeasible_geom: int = len(infeasible_geom_DF)

    # Calculate the relative energies of conformers and write the results to a CSV file
    rel_energy_DF: pd.DataFrame = calculate_relative_energies(energy_DF, feasible_geometries_csv)

    return num_feasible_geom, num_infeasible_geom, rel_energy_DF

def step4_calculate_rmsd(
    feasible_geometries_sdf: str,
    pairwise_RMSDs_dat: str,
    pairwise_RMSDs_csv: str
) -> np.ndarray:
    """
    Step 4: Calculate the RMSD matrix between generated conformers, save the results,
    and return the condensed matrix.

    Args:
        feasible_geometries_sdf (str): Path to the SDF file containing conformers with feasible geometries.
        pairwise_RMSDs_dat (str): Path to the output file containing the pairwise RMSD matrix.
        pairwise_RMSDs_csv (str): Path to save the condensed pairwise RMSD matrix in CSV format.

    Returns:
        np.ndarray: The condensed pairwise RMSD matrix.
    """
    print(colored("Step 4: Calculating RMSD between generated conformers", "cyan"))

    # Run RMSD calculation on the SDF file
    calculate_rmsd(feasible_geometries_sdf, pairwise_RMSDs_dat)

    # Read the pairwise RMSD matrix from the output file
    rmsd_matrix_DF: pd.DataFrame = pd.read_csv(pairwise_RMSDs_dat, header=None, index_col=0)

    # Convert the pairwise RMSD matrix into a numpy float-type 2D array
    rmsd_matrix: np.ndarray = rmsd_matrix_DF.to_numpy(dtype=float)

    # Round the matrix elements to two decimal places to avoid possible asymmetry due to numerical errors
    rmsd_matrix_2DP: np.ndarray = np.round(rmsd_matrix, 2)

    # Force the matrix to be symmetric
    rmsd_matrix_2DP: np.ndarray = (rmsd_matrix_2DP + rmsd_matrix_2DP.T) / 2

    # Check if the matrix is symmetric
    if not is_valid_dm(rmsd_matrix_2DP, throw=False):
        raise ValueError("The provided RMSD matrix is not symmetric even after rounding and forcing symmetry.")

    # Convert the pairwise distance matrix to its condensed form and save it to a CSV file
    condensed_matrix: np.ndarray = squareform(rmsd_matrix_2DP)
    pairwise_RMSDs_DF: pd.DataFrame = pd.DataFrame(condensed_matrix)
    pairwise_RMSDs_DF.to_csv(pairwise_RMSDs_csv, header=['pairwise_RMSD'], index=False)

    return condensed_matrix

def step5_perform_clustering(
    condensed_matrix: np.ndarray,
    num_clusters: int = 20
) -> Dict[int, List[int]]:
    """
    Step 5: Perform hierarchical clustering on generated conformers and return the cluster sets.

    Args:
        condensed_matrix (np.ndarray): The condensed pairwise RMSD matrix.
        num_clusters (int, optional): The number of clusters to form. Defaults to 20.

    Returns:
        Dict[int, List[int]]: A dictionary where keys are cluster labels and values are lists of indices in each cluster.
    """
    print(colored("Step 5: Performing Hierarchical clustering on generated conformers", "cyan"))

    # Perform hierarchical clustering using the 'ward' linkage method
    linkage_matrix_ward: np.ndarray = sch.linkage(condensed_matrix, method='ward')

    # For each conformer, assign the cluster label to which it belongs
    cluster_labels: np.ndarray = fcluster(linkage_matrix_ward, num_clusters, criterion='maxclust')

    # Create an empty dictionary to store the cluster sets
    clusters: Dict[int, List[int]] = {i: [] for i in range(1, num_clusters + 1)}

    # Assign each cluster label to the respective cluster set
    for index, label in enumerate(cluster_labels):
        clusters[label].append(index)  # Store the indices of conformers in the cluster
    
    return clusters


def step6_identify_cluster_representatives(
    clusters: Dict[int, List[int]],
    rel_energy_DF: pd.DataFrame,
    cluster_reps_csv: str,
    opt_conf_sdf: str,
    cluster_reps_dir: str,
    cluster_reps_sdf: str,
    cluster_rep_prefix: str,
    conf_extension: str
) -> None:
    """
    Step 6: Identify cluster representatives by finding the minimum energy conformer in each cluster,
    and write the representative conformers' data to CSV and SDF files.

    Args:
        clusters (Dict[int, List[int]]): A dictionary where keys are cluster labels and values are lists of indices in each cluster.
        rel_energy_DF (pd.DataFrame): DataFrame containing relative energies of conformers with columns including 'conformer_id' and 'rel_energy_in_kcalpermol'.
        cluster_reps_csv (str): Path to save the sorted cluster representatives in CSV format.
        opt_conf_sdf (str): Path to the SDF file containing optimized conformers.
        cluster_reps_dir (str): Directory to save the cluster representative SDF files.
        cluster_reps_sdf (str): File path for the cluster representatives SDF file.
        cluster_rep_prefix (str): Prefix for naming cluster representative files.
        conf_extension (str): Extension for conformer files.
    
    Returns:
        None
    """
    print(colored("Step 6: Identifying cluster representatives", "cyan"))

    # Initialize a list to hold DataFrames for cluster representatives
    cluster_reps_list: List[pd.DataFrame] = []

    # Loop through all clusters to find the representative conformer
    for clust_label, clust_elements in clusters.items():
        if len(clust_elements) != 0:
            # Extract the relative energies of the cluster elements into a DataFrame
            clust_DF: pd.DataFrame = rel_energy_DF.loc[clust_elements]
            
            # Find the index of the minimum energy conformer within the cluster
            min_energy_index: int = clust_DF['rel_energy_in_kcalpermol'].idxmin()
            
            # Isolate the representative conformer's relative energy into a DataFrame
            min_energy_DF: pd.DataFrame = clust_DF.loc[[min_energy_index]]
            
            # Add the 'cluster ID' information to the DataFrame
            min_energy_DF['cluster_id'] = clust_label
            
            # Append the DataFrame for this cluster representative to the list
            cluster_reps_list.append(min_energy_DF)

    # Concatenate the DataFrames of all cluster representatives into a single DataFrame
    cluster_reps_DF: pd.DataFrame = pd.concat(cluster_reps_list, ignore_index=True)

    # Sort the cluster representatives by 'conformer_id' and save to a CSV file
    sorted_cluster_reps_DF: pd.DataFrame = cluster_reps_DF.sort_values(by='conformer_id', ascending=True)
    sorted_cluster_reps_DF.to_csv(cluster_reps_csv, index=False)

    # Write the coordinates of cluster representative conformers to SDF files
    write_cluster_representatives(
        opt_conf_sdf,
        cluster_reps_dir,
        cluster_reps_sdf,
        sorted_cluster_reps_DF,
        cluster_reps_DF,
        cluster_rep_prefix,
        conf_extension
    )


@app.command()
def main(
    inp_smiles: str,
    num_conf: int = 1000,
    num_clusters: int = 20,
    ref_confo_path: str = None,
    geom_opt: bool = False,
    dielectric_value: float = 1.0
) -> None:
    """
    Main function to process the conformer generation pipeline, with optional geometry optimization.

    Args:
        inp_smiles (str): The input SMILES string.
        num_conf (int, optional): Number of conformers to generate.
        num_clusters (int, optional): Number of clusters.
        ref_confo_path (str, optional): Path to the reference conformer.
        geom_opt (bool, optional): Whether to run geometry optimization.
        dielectric_value (float, optional): Dielectric value for geometry optimization. Defaults to 1.0.

    Returns:
        None
    """

    start_time = time.time()
    print(colored("Pipeline Started", "blue"))

    # Steps 1-6 as before ...
    ref_confo_path, output_dir = step1_input_and_verify(ref_confo_path)
    mol = step2_generate_conformers(inp_smiles, num_conf, init_conf_sdf)
    num_atoms_generated_conf = mol.GetNumAtoms()
    num_feasible_geom, num_infeasible_geom, rel_energy_DF = step3_optimize_conformers(
        mol, opt_conf_sdf, opt_conf_energy_csv, opt_conf_SMILES_file,
        feasible_geometries_sdf, infeasible_geometries_sdf, similarity_output_csv,
        infeasible_geometries_csv, inp_smiles, feasible_geometries_csv
    )
    condensed_matrix = step4_calculate_rmsd(feasible_geometries_sdf, pairwise_RMSDs_dat, pairwise_RMSDs_csv)
    clusters = step5_perform_clustering(condensed_matrix, num_clusters=num_clusters)
    step6_identify_cluster_representatives(
        clusters=clusters,
        rel_energy_DF=rel_energy_DF,
        cluster_reps_csv=cluster_reps_csv,
        opt_conf_sdf=opt_conf_sdf,
        cluster_reps_dir=cluster_reps_dir,
        cluster_reps_sdf=cluster_reps_sdf,
        cluster_rep_prefix=cluster_rep_prefix,
        conf_extension=conf_extension
    )

    ###############################
    # Geometry Optimization Block #
    ###############################
    if geom_opt:
        # dielectric_value will be 1.0 unless overridden by user
        sdf_files = sorted(glob.glob(os.path.join(cluster_reps_dir, "*.sdf")))
        if not sdf_files:
            print(colored(f"No SDF files found in {cluster_reps_dir}", "yellow"))
        for i, sdf_path in enumerate(sdf_files):
            start_time_sub = time.time()
            # Get atom list from SDF file
            atom_list = get_atom_list(sdf_path)
            mol1 = gto.M(
                atom=atom_list,
                basis='def2-svpd',
                charge=0,
                spin=0,
                verbose=4,
            )
            xyz_filename = sdf_path.replace('.sdf', '.xyz')
            HA = opti_PCM(mol1, dielectric_value, xyz_filename)
    ###############################

    #print(colored("Step 7: Calculating Minimum RMSD between Reference conformer and Cluster Representatives", "cyan"))
    
    if geom_opt:
        xyz_files = sorted(glob.glob(os.path.join(cluster_reps_dir, "*.xyz")))
        if not xyz_files:
            print(colored(f"No xyz files found in {cluster_reps_dir}", "yellow"))
        elif ref_confo_path:       
            calculate_rmsd_outputs(ref_confo_path, xyz_files) 
        else:
            calculate_rmsd_outputs(xyz_files[0], xyz_files[1:],output_sdf="cluster_rep_conformers_vs_gen_conformer.sdf")   

    else:
        if ref_confo_path is not None:
            calculate_rmsd_outputs(ref_confo_path, cluster_reps_sdf)
        else:
            sdf_files = sorted(glob.glob(os.path.join(cluster_reps_dir, "*.sdf")))
            calculate_rmsd_outputs(sdf_files[0], sdf_files[1:],output_sdf="cluster_rep_conformers_vs_gen_conformer.sdf") 

        



    end_time = time.time()
    execution_time_seconds = end_time - start_time
    execution_time_minutes = execution_time_seconds // 60

    print(f'Number_of_feasible_geometries: {num_feasible_geom}')
    # if ref_confo_path is not None:
    #     print(f'Min_RMSD_20_cluster : {result}')
    print(f'Execution_time : {execution_time_minutes}')

    os.chdir("..")
    #shutil.rmtree(output_dir)
    print(colored("Pipeline Completed Successfully", "green"))

if __name__ == "__main__":
    app()
