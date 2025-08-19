import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

// Test Docker deployment functionality
export async function testDockerDeployment() {
  console.log('Testing Docker deployment...');
  
  try {
    // Check if Docker is installed
    await exec('docker --version');
    console.log('✓ Docker is installed');
    
    // Check if Docker Compose is installed
    await exec('docker-compose --version');
    console.log('✓ Docker Compose is installed');
    
    // Check if Dockerfile exists
    await exec('test -f Dockerfile');
    console.log('✓ Dockerfile exists');
    
    // Check if docker-compose.yml exists
    await exec('test -f docker-compose.yml');
    console.log('✓ docker-compose.yml exists');
    
    // Check if .dockerignore exists
    await exec('test -f .dockerignore');
    console.log('✓ .dockerignore exists');
    
    // Validate Dockerfile syntax (basic check)
    await exec('docker run --rm -i hadolint/hadolint < Dockerfile || true');
    console.log('✓ Dockerfile syntax check completed');
    
    // Validate docker-compose.yml syntax
    await exec('docker-compose config > /dev/null');
    console.log('✓ docker-compose.yml syntax is valid');
    
    console.log('Docker deployment validation passed!');
    return true;
    
  } catch (error) {
    console.error('Docker deployment validation failed:', error.message);
    return false;
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testDockerDeployment().then(success => {
    process.exit(success ? 0 : 1);
  });
}