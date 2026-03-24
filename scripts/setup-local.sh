#!/bin/bash
set -euo pipefail

# EVE Secure Local Development Setup
# This script sets up the local development environment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
print_status() {
    echo -e "${GREEN}→${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1" >&2
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        echo "Please install Node.js 20 or later from https://nodejs.org"
        exit 1
    fi

    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 20 ]; then
        print_error "Node.js 20 or later is required (found v$node_version)"
        exit 1
    fi
    print_success "Node.js $(node --version) is installed"

    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    print_success "npm $(npm --version) is installed"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        echo "Please install Docker from https://www.docker.com"
        exit 1
    fi
    print_success "Docker $(docker --version | awk '{print $3}' | tr -d ',') is installed"

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        print_warning "docker-compose command not found, checking 'docker compose'..."
        if ! docker compose version &> /dev/null; then
            print_error "Docker Compose is not installed"
            exit 1
        fi
    fi
    print_success "Docker Compose is available"

    # Check Docker daemon
    if ! docker ps &> /dev/null; then
        print_error "Docker daemon is not running"
        echo "Please start Docker and try again"
        exit 1
    fi
    print_success "Docker daemon is running"
}

# Setup environment file
setup_env_file() {
    print_status "Setting up environment configuration..."

    local env_file="$PROJECT_ROOT/.env.local"

    if [ -f "$env_file" ]; then
        print_warning ".env.local already exists, skipping creation"
        return 0
    fi

    if [ ! -f "$PROJECT_ROOT/.env.example" ]; then
        print_error ".env.example file not found"
        exit 1
    fi

    cp "$PROJECT_ROOT/.env.example" "$env_file"
    print_success "Created .env.local from .env.example"

    # Generate secure secrets
    local db_password=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    local redis_password=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    local jwt_secret=$(openssl rand -base64 64)
    local encryption_key=$(openssl rand -base64 32)

    # Update .env.local with generated secrets
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/DB_PASSWORD=.*/DB_PASSWORD=$db_password/" "$env_file"
        sed -i '' "s/REDIS_PASSWORD=.*/REDIS_PASSWORD=$redis_password/" "$env_file"
        sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$jwt_secret/" "$env_file"
        sed -i '' "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$encryption_key/" "$env_file"
    else
        # Linux
        sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=$db_password/" "$env_file"
        sed -i "s/REDIS_PASSWORD=.*/REDIS_PASSWORD=$redis_password/" "$env_file"
        sed -i "s/JWT_SECRET=.*/JWT_SECRET=$jwt_secret/" "$env_file"
        sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$encryption_key/" "$env_file"
    fi

    print_success "Configured secrets in .env.local"
}

# Install dependencies
install_dependencies() {
    print_status "Installing npm dependencies..."

    cd "$PROJECT_ROOT"
    npm ci

    print_success "Dependencies installed"
}

# Start Docker services
start_docker_services() {
    print_status "Starting Docker services..."

    cd "$PROJECT_ROOT"

    # Check if containers are already running
    if docker-compose ps | grep -q "Up"; then
        print_warning "Some containers are already running"
        read -p "Do you want to restart them? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker-compose down --remove-orphans
        else
            print_status "Skipping Docker service start"
            return 0
        fi
    fi

    # Compose command (handle both docker-compose and docker compose)
    local compose_cmd="docker-compose"
    if ! command -v docker-compose &> /dev/null; then
        compose_cmd="docker compose"
    fi

    $compose_cmd --file infra/docker/docker-compose.yml up -d

    print_status "Waiting for services to be healthy..."
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if $compose_cmd --file infra/docker/docker-compose.yml ps | grep -q "Up"; then
            print_success "Docker services are running"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    print_warning "Timeout waiting for services, they may still be starting"
}

# Run database migrations
run_migrations() {
    print_status "Running database migrations..."

    cd "$PROJECT_ROOT"

    # Wait for PostgreSQL to be ready
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if npm run db:migrate:latest 2>/dev/null; then
            print_success "Database migrations completed"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
    done

    print_warning "Database migrations timed out or failed, you may need to run manually"
}

# Seed database
seed_database() {
    print_status "Seeding database with initial data..."

    cd "$PROJECT_ROOT"

    if npm run db:seed 2>/dev/null; then
        print_success "Database seeding completed"
    else
        print_warning "Database seeding failed or skipped"
    fi
}

# Build TypeScript
build_typescript() {
    print_status "Building TypeScript..."

    cd "$PROJECT_ROOT"

    if npm run build 2>/dev/null; then
        print_success "TypeScript build completed"
    else
        print_warning "TypeScript build failed"
    fi
}

# Final instructions
print_final_instructions() {
    echo ""
    print_success "Local development environment is ready!"
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. Start the development server:"
    echo "   cd $PROJECT_ROOT"
    echo "   npm run dev"
    echo ""
    echo "2. Access the application:"
    echo "   API: http://localhost:3000"
    echo "   PostgreSQL: localhost:5432"
    echo "   Redis: localhost:6379"
    echo "   ClamAV: localhost:3310"
    echo ""
    echo "3. View logs:"
    echo "   docker-compose --file infra/docker/docker-compose.yml logs -f"
    echo ""
    echo "4. Stop services:"
    echo "   docker-compose --file infra/docker/docker-compose.yml down"
    echo ""
    echo "For more information, see docs/DEVELOPMENT.md"
    echo ""
}

# Main execution
main() {
    echo ""
    echo "================================"
    echo "EVE Secure Local Setup"
    echo "================================"
    echo ""

    check_prerequisites
    setup_env_file
    install_dependencies
    start_docker_services
    run_migrations
    seed_database
    build_typescript
    print_final_instructions
}

# Run main function
main "$@"
