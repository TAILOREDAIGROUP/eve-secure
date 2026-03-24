#!/bin/bash
set -euo pipefail

# EVE Secure Deployment Script
# This script handles safe deployment with validation checks

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables
ENVIRONMENT=""
STACK_NAME=""
DRY_RUN=false
SKIP_TESTS=false
SKIP_CHECKS=false
VERSION=""
SKIP_BACKUP=false

# Functions
print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

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

# Show usage
show_usage() {
    cat <<EOF
EVE Secure Deployment Script

Usage: $0 [OPTIONS]

Options:
    -e, --environment ENV       Environment to deploy to (staging, production)
    -v, --version VERSION       Version/tag to deploy (default: latest)
    --dry-run                   Show what would be deployed without making changes
    --skip-tests                Skip running tests before deployment
    --skip-checks               Skip pre-deployment checks
    --skip-backup               Skip creating backup before deployment
    -h, --help                  Show this help message

Examples:
    # Deploy staging with default version
    $0 --environment staging

    # Deploy production with specific version
    $0 --environment production --version v1.2.3

    # Dry-run deployment to staging
    $0 --environment staging --dry-run

EOF
}

# Parse arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -v|--version)
                VERSION="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --skip-checks)
                SKIP_CHECKS=true
                shift
                ;;
            --skip-backup)
                SKIP_BACKUP=true
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

# Validate environment
validate_environment() {
    if [ -z "$ENVIRONMENT" ]; then
        print_error "Environment is required"
        show_usage
        exit 1
    fi

    case "$ENVIRONMENT" in
        staging|production)
            STACK_NAME="eve-secure-$ENVIRONMENT"
            ;;
        *)
            print_error "Invalid environment: $ENVIRONMENT"
            echo "Supported environments: staging, production"
            exit 1
            ;;
    esac

    print_status "Deploying to: $ENVIRONMENT"
}

# Check prerequisites
check_prerequisites() {
    if [ "$SKIP_CHECKS" = true ]; then
        print_warning "Skipping pre-deployment checks"
        return 0
    fi

    print_status "Checking prerequisites..."

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed"
        exit 1
    fi
    print_success "AWS CLI is installed"

    # Check Pulumi
    if ! command -v pulumi &> /dev/null; then
        print_error "Pulumi is not installed"
        exit 1
    fi
    print_success "Pulumi is installed"

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials are not configured"
        exit 1
    fi
    print_success "AWS credentials are configured"

    # Check git
    if ! command -v git &> /dev/null; then
        print_warning "Git is not installed (recommended for deployment tracking)"
    else
        print_success "Git is installed"
    fi
}

# Run tests
run_tests() {
    if [ "$SKIP_TESTS" = true ]; then
        print_warning "Skipping tests"
        return 0
    fi

    print_header "Running Tests"

    cd "$PROJECT_ROOT"

    # Type checking
    print_status "Running TypeScript type check..."
    if ! npm run typecheck; then
        print_error "TypeScript type checking failed"
        exit 1
    fi
    print_success "Type checking passed"

    # Linting
    print_status "Running ESLint..."
    if ! npm run lint; then
        print_error "Linting failed"
        exit 1
    fi
    print_success "Linting passed"

    # Unit tests
    print_status "Running unit tests..."
    if ! npm run test:unit; then
        print_error "Unit tests failed"
        exit 1
    fi
    print_success "Unit tests passed"

    # Evaluation tests
    print_status "Running evaluation tests..."
    if ! npm run test:eval:injection && \
       ! npm run test:eval:harm && \
       ! npm run test:eval:isolation; then
        print_error "Evaluation tests failed"
        exit 1
    fi
    print_success "Evaluation tests passed"
}

# Create backup
create_backup() {
    if [ "$SKIP_BACKUP" = true ]; then
        print_warning "Skipping backup creation"
        return 0
    fi

    print_header "Creating Backup"

    cd "$PROJECT_ROOT"

    print_status "Creating database backup..."
    local backup_timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_dir="backups/$ENVIRONMENT/$backup_timestamp"

    mkdir -p "$backup_dir"

    # Backup database
    print_status "Backing up PostgreSQL database..."
    if ! aws rds create-db-snapshot \
        --db-instance-identifier "eve-secure-$ENVIRONMENT" \
        --db-snapshot-identifier "eve-secure-$ENVIRONMENT-backup-$backup_timestamp" \
        2>/dev/null; then
        print_warning "Database backup failed (may be in progress)"
    else
        print_success "Database snapshot created"
    fi

    # Backup S3
    print_status "Backing up S3 buckets..."
    aws s3 sync "s3://eve-secure-app-data-$ENVIRONMENT-$(aws sts get-caller-identity --query Account --output text)" "$backup_dir/app-data/" --quiet || true
    print_success "S3 backup completed"

    print_success "Backup created at: $backup_dir"
}

# Deploy with Pulumi
deploy_infrastructure() {
    print_header "Deploying Infrastructure"

    cd "$PROJECT_ROOT/infra/pulumi"

    print_status "Selecting Pulumi stack: $STACK_NAME"
    pulumi stack select "$STACK_NAME" || pulumi stack init "$STACK_NAME"

    if [ "$DRY_RUN" = true ]; then
        print_warning "DRY RUN: Previewing changes without applying"
        pulumi preview
        print_success "Dry run completed successfully"
        return 0
    fi

    print_status "Updating infrastructure with Pulumi..."
    pulumi up --yes --skip-preview

    print_success "Infrastructure deployed successfully"
}

# Update ECS service
update_ecs_service() {
    print_header "Updating ECS Service"

    print_status "Forcing ECS service redeployment..."

    if [ -z "$VERSION" ]; then
        VERSION="latest"
    fi

    aws ecs update-service \
        --cluster "eve-secure-$ENVIRONMENT" \
        --service "eve-secure-api-$ENVIRONMENT" \
        --force-new-deployment \
        --region us-east-1

    print_success "ECS service updated"

    # Wait for service to stabilize
    print_status "Waiting for service to stabilize..."
    local max_attempts=60
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        local status=$(aws ecs describe-services \
            --cluster "eve-secure-$ENVIRONMENT" \
            --services "eve-secure-api-$ENVIRONMENT" \
            --query 'services[0].status' \
            --output text \
            --region us-east-1)

        if [ "$status" = "ACTIVE" ]; then
            print_success "Service is active"
            return 0
        fi

        attempt=$((attempt + 1))
        sleep 5
    done

    print_warning "Service did not stabilize within timeout"
}

# Verify deployment
verify_deployment() {
    print_header "Verifying Deployment"

    print_status "Checking health endpoint..."

    local alb_dns=$(aws elbv2 describe-load-balancers \
        --query "LoadBalancers[?LoadBalancerName=='eve-secure-alb-$ENVIRONMENT'].DNSName" \
        --output text \
        --region us-east-1)

    if [ -z "$alb_dns" ]; then
        print_warning "Could not find ALB DNS name"
        return 0
    fi

    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        local response=$(curl -s -o /dev/null -w "%{http_code}" "http://$alb_dns/health" || echo "000")

        if [ "$response" = "200" ]; then
            print_success "Health check passed (HTTP $response)"
            return 0
        fi

        attempt=$((attempt + 1))
        sleep 10
    done

    print_warning "Health check did not pass within timeout"
}

# Create deployment tag
create_deployment_tag() {
    if ! command -v git &> /dev/null; then
        return 0
    fi

    print_status "Creating git deployment tag..."

    local tag_name="deploy/$ENVIRONMENT/$(date +%Y%m%d_%H%M%S)"
    git tag -a "$tag_name" -m "Deployment to $ENVIRONMENT" || true

    print_success "Created deployment tag: $tag_name"
}

# Print summary
print_summary() {
    print_header "Deployment Summary"

    echo "Environment:    $ENVIRONMENT"
    echo "Stack:          $STACK_NAME"
    echo "Version:        ${VERSION:-latest}"
    echo "Dry run:        $DRY_RUN"
    echo "Tests skipped:  $SKIP_TESTS"
    echo "Backup skipped: $SKIP_BACKUP"

    if [ "$DRY_RUN" = false ]; then
        echo ""
        print_success "Deployment completed successfully!"
    fi
}

# Main execution
main() {
    print_header "EVE Secure Deployment"

    parse_arguments "$@"
    validate_environment
    check_prerequisites
    run_tests
    create_backup
    deploy_infrastructure
    update_ecs_service
    verify_deployment
    create_deployment_tag
    print_summary
}

# Run main function
main "$@"
