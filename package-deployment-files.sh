#!/bin/bash
#
# Package all deployment files into a single archive
#

cd /root/proisp

echo "Creating deployment package..."

tar -czf ssh-password-sync-fix-deployment.tar.gz \
  license-server-migration.sql \
  license-server-secrets-handler-update.go \
  install.sh \
  SSH_PASSWORD_SYNC_FIX.md \
  DEPLOY_INSTRUCTIONS.txt \
  ALTERNATIVE_DEPLOYMENT.md 2>/dev/null

if [ -f ssh-password-sync-fix-deployment.tar.gz ]; then
    SIZE=$(du -h ssh-password-sync-fix-deployment.tar.gz | cut -f1)
    echo "✓ Package created: /root/proisp/ssh-password-sync-fix-deployment.tar.gz ($SIZE)"
    echo ""
    echo "Package contents:"
    tar -tzf ssh-password-sync-fix-deployment.tar.gz
    echo ""
    echo "To extract on license server:"
    echo "  tar -xzf ssh-password-sync-fix-deployment.tar.gz"
else
    echo "✗ Failed to create package"
    exit 1
fi
