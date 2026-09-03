// Jenkinsfile — vanadium CI pipeline
//
// Runs on vd-ci-jenkins (vanadium, 192.168.1.209). The Jenkins container
// has Java 21 + sonar-scanner + Docker CLI (socket mounted). Node.js and
// Python stages run in lightweight Docker containers via the mounted socket.
//
// Trigger: pollSCM every 5 min (the github plugin is not installed on
// vd-ci-jenkins, so githubPush() is invalid there — build #1 died at Groovy
// parse with "Invalid trigger type githubPush"). A GitHub webhook can be
// added later if the plugin is installed.
// sonar-project.properties governs SonarQube scope; quality gate enforced.

pipeline {
    agent any

    options {
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
    }
    triggers {
        // github plugin is not installed on vd-ci-jenkins — pollSCM needs
        // nothing beyond the (installed) git plugin.
        pollSCM('H/5 * * * *')
    }

    environment {
        SONAR_HOST = 'http://sonarqube:9000'
        SONAR_TOKEN = credentials('sonar-token')
    }

    stages {
        stage('Checkout') {
            steps {
                // Inline pipeline jobs have no SCM provenance, so checkout scm
                // fails to resolve — check out main explicitly instead.
                // (No credentialsId: the repo is publicly clonable; add one
                // here if it ever goes private.)
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: '*/main']],
                    userRemoteConfigs: [[
                        url: 'https://github.com/markpippins/nexus.git'
                    ]]
                ])
            }
        }

        // ── Build workspace deps ────────────────────────────────
        // file: dependencies (e.g. heartbeat-client) resolve to source
        // packages whose dist/ is gitignored; a fresh clone lacks them and
        // typecheck fails with "Cannot find module". Build every package
        // with a build script first (best-effort; real failures surface in
        // the Typecheck stage).
        // CPS-SAFE LOOPS: a Groovy IntRange (1..2) and for-in over it are
        // NOT serializable — the pipeline dies at the first sh step with
        // NotSerializableException (builds #9/#10). C-style int loops and
        // indexed access survive CPS serialization. Two passes: pass 1
        // builds leaf packages, pass 2 builds dependents (alphabetical
        // order builds conduit-srv before heartbeat-client).
        stage('Build Workspace Deps') {
            steps {
                script {
                    def hostWs = env.WORKSPACE.replace('/var/jenkins_home', '/home/codex/vd-jenkins-home')
                    def tsconfigs = sh(
                        script: 'find typescript -maxdepth 2 -name tsconfig.json | sort',
                        returnStdout: true
                    ).trim().split('\n').findAll { it }

                    for (int pass = 1; pass <= 2; pass++) {
                        for (int i = 0; i < tsconfigs.size(); i++) {
                            def svc = tsconfigs[i].replace('typescript/', '').replace('/tsconfig.json', '')
                            sh(
                                script: """
                                    set -o pipefail
                                    docker run --rm \
                                        -v "${hostWs}:/ws" -w /ws \
                                        node:20-bookworm \
                                        bash -c "cd 'typescript/${svc}' && grep -q '\"build\"' package.json && npm install --ignore-scripts --no-audit --no-fund --silent 2>/dev/null && npm run build 2>/dev/null" \
                                        2>&1 | tail -5 || true
                                """,
                                returnStatus: true
                            )
                        }
                    }
                    echo "Workspace deps built."
                }
            }
        }

        // ── TypeScript typecheck ────────────────────────────────────
        // Runs npx tsc --noEmit in each service that has a tsconfig.
        // One Node.js container per service; failures are collected,
        // not short-circuited, so you see ALL broken services at once.
        stage('Typecheck') {
            steps {
                script {
                    def hostWs = env.WORKSPACE.replace('/var/jenkins_home', '/home/codex/vd-jenkins-home')
                    def tsconfigs = sh(
                        script: 'find typescript -maxdepth 2 -name tsconfig.json | sort',
                        returnStdout: true
                    ).trim().split('\n').findAll { it }

                    def failures = []
                    def total = tsconfigs.size()
                    def current = 0

                    for (tc in tsconfigs) {
                        current++
                        def svc = tc.replace('typescript/', '').replace('/tsconfig.json', '')
                        echo "[Typecheck ${current}/${total}] ${svc}..."
                        def rc = sh(
                            script: """
                                docker run --rm \
                                    -v "${hostWs}:/ws" -w /ws \
                                    node:20-bookworm \
                                    bash -c "set -o pipefail; cd 'typescript/${svc}' && npm install --ignore-scripts --no-audit --no-fund --silent 2>/dev/null && npx tsc --noEmit" \
                                    2>&1 | tail -20
                            """,
                            returnStatus: true
                        )
                        if (rc != 0) {
                            failures << svc
                            echo "  ✗ ${svc} FAILED"
                        } else {
                            echo "  ✓ ${svc} OK"
                        }
                    }

                    if (failures) {
                        error("Typecheck failed: ${failures.join(', ')}")
                    }
                }
            }
        }

        // ── Python tests ───────────────────────────────────────────
        // Runs pytest in each Python package that has a tests/ dir.
        stage('Python Tests') {
            steps {
                script {
                    def hostWs = env.WORKSPACE.replace('/var/jenkins_home', '/home/codex/vd-jenkins-home')
                    def pyPkgs = sh(
                        script: 'find python -maxdepth 2 -type d -name tests | sed "s|/tests||" | sort',
                        returnStdout: true
                    ).trim().split('\n').findAll { it }

                    def failures = []
                    def total = pyPkgs.size()
                    def current = 0

                    for (pkg in pyPkgs) {
                        current++
                        def pkgName = pkg.replace('python/', '')
                        echo "[Pytest ${current}/${total}] ${pkgName}..."
                        def rc = sh(
                            script: """
                                docker run --rm \
                                    -v "${hostWs}:/ws" -w /ws \
                                    python:3.12-slim \
                                    bash -c "set -o pipefail; cd 'python/${pkgName}' && \
                                        pip install -q -e '.[test]' 2>/dev/null || pip install -q -e . 2>/dev/null || true && \
                                        pip install -q pytest 2>/dev/null && \
                                        python -m pytest tests/ -x -q --tb=short 2>&1 | tail -30" \
                                    2>&1 | tail -30
                            """,
                            returnStatus: true
                        )
                        if (rc != 0) {
                            failures << pkgName
                            echo "  ✗ ${pkgName} FAILED"
                        } else {
                            echo "  ✓ ${pkgName} OK"
                        }
                    }

                    if (failures) {
                        error("Python tests failed: ${failures.join(', ')}")
                    }
                }
            }
        }

        // ── TypeScript tests ────────────────────────────────────────
        // Runs npm test in each TS service that declares a test script.
        stage('TS Tests') {
            steps {
                script {
                    def hostWs = env.WORKSPACE.replace('/var/jenkins_home', '/home/codex/vd-jenkins-home')
                    def tsPkgs = sh(
                        script: """
                            grep -rl '"test"' typescript/*/package.json 2>/dev/null \
                                | sed 's|/package.json||' | sort
                        """,
                        returnStdout: true
                    ).trim().split('\n').findAll { it }

                    def failures = []
                    def total = tsPkgs.size()
                    def current = 0

                    for (pkg in tsPkgs) {
                        current++
                        def svc = pkg.replace('typescript/', '')
                        echo "[TS Test ${current}/${total}] ${svc}..."
                        def rc = sh(
                            script: """
                                docker run --rm \
                                    -v "${hostWs}:/ws" -w /ws \
                                    node:20-bookworm \
                                    bash -c "set -o pipefail; cd 'typescript/${svc}' && npm install --ignore-scripts --no-audit --no-fund --silent 2>/dev/null && npm test" \
                                    2>&1 | tail -30
                            """,
                            returnStatus: true
                        )
                        if (rc != 0) {
                            failures << svc
                            echo "  ✗ ${svc} FAILED"
                        } else {
                            echo "  ✓ ${svc} OK"
                        }
                    }

                    if (failures) {
                        error("TS tests failed: ${failures.join(', ')}")
                    }
                }
            }
        }

        // ── SonarQube scan ─────────────────────────────────────────
        // Uses the sonar-scanner installed in the Jenkins container.
        // sonar-project.properties governs scope; quality gate enforced.
        stage('SonarQube') {
            steps {
                withSonarQubeEnv('vd-sonar') {
                    sh '''
                        /var/jenkins_home/tools/sonar-scanner/bin/sonar-scanner \
                            -Dsonar.host.url="$SONAR_HOST_URL" \
                            -Dsonar.projectKey=nexus \
                            -Dsonar.projectBaseDir="$WORKSPACE" \
                            -Dsonar.qualitygate.wait=true \
                            -Dsonar.qualitygate.timeout=600
                    '''
                }
            }
        }

        // ── Quality gate ────────────────────────────────────────────
        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }
    }

    post {
        always {
            // Clean up Docker containers used by typecheck/test stages
            sh 'docker container prune -f 2>/dev/null || true'
        }
        success {
            echo '✅ Pipeline passed — typecheck, tests, and SonarQube gate all green.'
        }
        failure {
            echo '❌ Pipeline failed — check stage logs above for details.'
        }
        unstable {
            echo '⚠️ Pipeline unstable — some tests may have been skipped.'
        }
    }
}
