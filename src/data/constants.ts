import type { PhysicsConstant } from '../types';

export const CONSTANTS: PhysicsConstant[] = [
  { id: 'g', symbol: 'g', name: 'Gravitational acceleration (Earth)', value: 9.80665, unit: 'm/s²', description: 'Acceleration due to gravity near Earth surface.', category: 'mechanics' },
  { id: 'c', symbol: 'c', name: 'Speed of light', value: 299792458, unit: 'm/s', description: 'Speed of light in vacuum.', category: 'relativity' },
  { id: 'h', symbol: 'h', name: 'Planck constant', value: 6.62607015e-34, unit: 'J·s', description: 'Quantum of action.', category: 'quantum' },
  { id: 'hbar', symbol: 'ℏ', name: 'Reduced Planck constant', value: 1.054571817e-34, unit: 'J·s', description: 'h/(2π).', category: 'quantum' },
  { id: 'k_B', symbol: 'k_B', name: 'Boltzmann constant', value: 1.380649e-23, unit: 'J/K', description: 'Relates temperature to energy.', category: 'thermodynamics' },
  { id: 'R', symbol: 'R', name: 'Gas constant', value: 8.314462618, unit: 'J/(mol·K)', description: 'Ideal gas constant.', category: 'thermodynamics' },
  { id: 'N_A', symbol: 'N_A', name: 'Avogadro number', value: 6.02214076e23, unit: 'mol⁻¹', description: 'Particles per mole.', category: 'general' },
  { id: 'e', symbol: 'e', name: 'Elementary charge', value: 1.602176634e-19, unit: 'C', description: 'Charge of a proton.', category: 'electromagnetism' },
  { id: 'm_e', symbol: 'm_e', name: 'Electron mass', value: 9.10938356e-31, unit: 'kg', description: 'Rest mass of electron.', category: 'quantum' },
  { id: 'm_p', symbol: 'm_p', name: 'Proton mass', value: 1.67262192369e-27, unit: 'kg', description: 'Rest mass of proton.', category: 'nuclear' },
  { id: 'G', symbol: 'G', name: 'Gravitational constant', value: 6.6743e-11, unit: 'N·m²/kg²', description: 'Universal gravitation.', category: 'mechanics' },
  { id: 'mu0', symbol: 'μ₀', name: 'Vacuum permeability', value: 1.25663706212e-6, unit: 'N/A²', description: 'Magnetic constant.', category: 'electromagnetism' },
  { id: 'eps0', symbol: 'ε₀', name: 'Vacuum permittivity', value: 8.8541878128e-12, unit: 'F/m', description: 'Electric constant.', category: 'electromagnetism' },
  { id: 'sigma', symbol: 'σ', name: 'Stefan-Boltzmann constant', value: 5.670374419e-8, unit: 'W/(m²·K⁴)', description: 'Thermal radiation.', category: 'thermodynamics' },
  { id: 'rho_water', symbol: 'ρ_water', name: 'Density of water', value: 1000, unit: 'kg/m³', description: 'At 4°C.', category: 'fluids' },
  { id: 'rho_air', symbol: 'ρ_air', name: 'Density of air', value: 1.225, unit: 'kg/m³', description: 'At sea level.', category: 'fluids' },
  { id: 'speed_sound', symbol: 'v_s', name: 'Speed of sound (air)', value: 343, unit: 'm/s', description: 'At 20°C.', category: 'waves' },
  { id: 'lambda_visible', symbol: 'λ', name: 'Visible light wavelength', value: 550e-9, unit: 'm', description: 'Green light approx.', category: 'optics' },
  { id: 'f0', symbol: 'f₀', name: 'Reference frequency', value: 440, unit: 'Hz', description: 'Musical note A4.', category: 'waves' },
];
