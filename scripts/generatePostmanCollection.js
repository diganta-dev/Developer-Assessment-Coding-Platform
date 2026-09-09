import fs from "fs";
import path from "path";

const collection = {
	info: {
		_postman_id: "8a32d1e0-74e2-4d2a-bf34-9cf72834b9d1",
		name: "Developer Assessment & Coding Platform - Full API Suite",
		description:
			"Comprehensive Postman Collection for Developer Assessment & Coding Platform Backend.\n\nIncludes all 12 modules: Authentication & Multi-Persona Logins, Company Management, Problem Bank, Assessment Lifecycle, Submissions, Anti-Cheating Telemetry, Evaluation Engine, Score Calculation, Ranking & Leaderboards, Reports & Analytics, and Admin Management.\n\nFeatures automated token & variable management: Access Token, Problem ID, Assessment ID, Attempt ID, and Submission ID are automatically captured and synchronized across requests.",
		schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
	},
	auth: {
		type: "bearer",
		bearer: [
			{
				key: "token",
				value: "{{accessToken}}",
				type: "string"
			}
		]
	},
	variable: [
		{
			key: "baseUrl",
			value: "https://developer-assessment-coding-platfor-psi.vercel.app/api/v1",
			type: "string",
			description: "Production API Base URL (Can switch to http://localhost:5000/api/v1 for local testing)"
		},
		{
			key: "rootUrl",
			value: "https://developer-assessment-coding-platfor-psi.vercel.app",
			type: "string",
			description: "Root Health check URL"
		},
		{
			key: "accessToken",
			value: "",
			type: "string"
		},
		{
			key: "refreshToken",
			value: "",
			type: "string"
		},
		{
			key: "companyId",
			value: "",
			type: "string"
		},
		{
			key: "problemId",
			value: "",
			type: "string"
		},
		{
			key: "assessmentId",
			value: "",
			type: "string"
		},
		{
			key: "attemptId",
			value: "",
			type: "string"
		},
		{
			key: "submissionId",
			value: "",
			type: "string"
		},
		{
			key: "candidateId",
			value: "",
			type: "string"
		},
		{
			key: "userId",
			value: "",
			type: "string"
		}
	],
	item: []
};

// Helper for test script that auto-captures tokens
const loginTestScript = {
	listen: "test",
	script: {
		exec: [
			"if (pm.response.code === 200 || pm.response.code === 201) {",
			"    const res = pm.response.json();",
			"    if (res.data && res.data.accessToken) {",
			"        pm.collectionVariables.set('accessToken', res.data.accessToken);",
			"        console.log('Access token saved to collection variable.');",
			"    }",
			"    if (res.data && res.data.refreshToken) {",
			"        pm.collectionVariables.set('refreshToken', res.data.refreshToken);",
			"    }",
			"}"
		],
		type: "text/javascript"
	}
};

// Helper for capturing problem ID
const createProblemTestScript = {
	listen: "test",
	script: {
		exec: [
			"if (pm.response.code === 200 || pm.response.code === 201) {",
			"    const res = pm.response.json();",
			"    if (res.data && res.data.id) {",
			"        pm.collectionVariables.set('problemId', res.data.id);",
			"        console.log('Problem ID saved: ' + res.data.id);",
			"    }",
			"}"
		],
		type: "text/javascript"
	}
};

// Helper for capturing assessment ID
const createAssessmentTestScript = {
	listen: "test",
	script: {
		exec: [
			"if (pm.response.code === 200 || pm.response.code === 201) {",
			"    const res = pm.response.json();",
			"    if (res.data && res.data.id) {",
			"        pm.collectionVariables.set('assessmentId', res.data.id);",
			"        console.log('Assessment ID saved: ' + res.data.id);",
			"    }",
			"}"
		],
		type: "text/javascript"
	}
};

// Helper for capturing attempt ID
const startAttemptTestScript = {
	listen: "test",
	script: {
		exec: [
			"if (pm.response.code === 200 || pm.response.code === 201) {",
			"    const res = pm.response.json();",
			"    const attempt = res.data?.attempt || res.data;",
			"    if (attempt && attempt.id) {",
			"        pm.collectionVariables.set('attemptId', attempt.id);",
			"        console.log('Attempt ID saved: ' + attempt.id);",
			"    }",
			"}"
		],
		type: "text/javascript"
	}
};

// Helper for capturing submission ID
const createSubmissionTestScript = {
	listen: "test",
	script: {
		exec: [
			"if (pm.response.code === 200 || pm.response.code === 201) {",
			"    const res = pm.response.json();",
			"    if (res.data && res.data.id) {",
			"        pm.collectionVariables.set('submissionId', res.data.id);",
			"        console.log('Submission ID saved: ' + res.data.id);",
			"    }",
			"}"
		],
		type: "text/javascript"
	}
};

// 00. Health Check
collection.item.push({
	name: "00. Health Check & Root",
	item: [
		{
			name: "Root Welcome (Server Status)",
			request: {
				auth: { type: "noauth" },
				method: "GET",
				header: [],
				url: { raw: "{{rootUrl}}/" }
			}
		}
	]
});

// 01. Authentication & Multi-Persona Logins
collection.item.push({
	name: "01. Authentication & Multi-Persona Logins",
	description: "Endpoints for authentication, login across 7 seeded personas, registration, email verification, and tokens.",
	item: [
		{
			name: "01. Login as Super Admin (Platform Super Admin)",
			event: [loginTestScript],
			request: {
				auth: { type: "noauth" },
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({ email: "superadmin@gmail.com", password: "superAdmin33#" }, null, 2)
				},
				url: { raw: "{{baseUrl}}/auth/login" }
			}
		},
		{
			name: "02. Login as Platform Admin",
			event: [loginTestScript],
			request: {
				auth: { type: "noauth" },
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({ email: "testadmin@gmail.com", password: "TestAdmin33#" }, null, 2)
				},
				url: { raw: "{{baseUrl}}/auth/login" }
			}
		},
		{
			name: "03. Login as Company Admin",
			event: [loginTestScript],
			request: {
				auth: { type: "noauth" },
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({ email: "tested.companyadmin@devassess.com", password: "CompanyAdmin123!#" }, null, 2)
				},
				url: { raw: "{{baseUrl}}/auth/login" }
			}
		},
		{
			name: "04. Login as Recruiter",
			event: [loginTestScript],
			request: {
				auth: { type: "noauth" },
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({ email: "tested.recruiter@devassess.com", password: "CompanyRecruiter123!#" }, null, 2)
				},
				url: { raw: "{{baseUrl}}/auth/login" }
			}
		},
		{
			name: "05. Login as Assessment Creator",
			event: [loginTestScript],
			request: {
				auth: { type: "noauth" },
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({ email: "tested.creator@devassess.com", password: "Creator123!#" }, null, 2)
				},
				url: { raw: "{{baseUrl}}/auth/login" }
			}
		},
		{
			name: "06. Login as Evaluator",
			event: [loginTestScript],
			request: {
				auth: { type: "noauth" },
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({ email: "tested.evaluator@devassess.com", password: "Evaluator123!#" }, null, 2)
				},
				url: { raw: "{{baseUrl}}/auth/login" }
			}
		},
		{
			name: "07. Login as Candidate",
			event: [loginTestScript],
			request: {
				auth: { type: "noauth" },
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({ email: "tested.candidate@devassess.com", password: "Candidate123!#" }, null, 2)
				},
				url: { raw: "{{baseUrl}}/auth/login" }
			}
		},
		{
			name: "08. Get Current Authenticated Profile (/me)",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/auth/me" }
			}
		},
		{
			name: "09. Refresh Access Token",
			event: [loginTestScript],
			request: {
				auth: { type: "noauth" },
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({ refreshToken: "{{refreshToken}}" }, null, 2)
				},
				url: { raw: "{{baseUrl}}/auth/refresh-token" }
			}
		},
		{
			name: "10. Register New Candidate",
			request: {
				auth: { type: "noauth" },
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						name: "Candidate Postman Test",
						email: "candidate.test@example.com",
						password: "CandidatePass123!#",
						candidateProfile: {
							phone: "+8801700000000",
							location: "Dhaka, Bangladesh",
							bio: "Full Stack Engineer"
						}
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/auth/register" }
			}
		},
		{
			name: "11. Verify Email OTP",
			event: [loginTestScript],
			request: {
				auth: { type: "noauth" },
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({ email: "candidate.test@example.com", otp: "123456" }, null, 2)
				},
				url: { raw: "{{baseUrl}}/auth/verify-email" }
			}
		},
		{
			name: "12. Logout User",
			request: {
				method: "POST",
				header: [],
				url: { raw: "{{baseUrl}}/auth/logout" }
			}
		}
	]
});

// 02. Company & Workspace Management
collection.item.push({
	name: "02. Company & Workspace Management",
	item: [
		{
			name: "01. Get My Company Profile",
			event: [
				{
					listen: "test",
					script: {
						exec: [
							"if (pm.response.code === 200) {",
							"    const res = pm.response.json();",
							"    if (res.data && res.data.id) {",
							"        pm.collectionVariables.set('companyId', res.data.id);",
							"    }",
							"}"
						],
						type: "text/javascript"
					}
				}
			],
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/company/my-company" }
			}
		},
		{
			name: "02. Get Company Members",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/company/{{companyId}}/members" }
			}
		},
		{
			name: "03. Create Company",
			request: {
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						name: "Apex Cyber Innovations",
						slug: "apex-cyber-innovations",
						email: "hr@apexcyber.com",
						website: "https://apexcyber.com",
						description: "AI-driven developer assessment and testing platform"
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/company/create-company" }
			}
		},
		{
			name: "04. Verify Company",
			request: {
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						companyId: "{{companyId}}",
						otp: "123456"
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/company/verify-company" }
			}
		},
		{
			name: "05. Update Company Profile",
			request: {
				method: "PATCH",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						name: "DevAssess Global Tech Enterprises",
						description: "Leading tech assessment benchmark"
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/company/update-company/{{companyId}}" }
			}
		},
		{
			name: "06. Add Company Member",
			request: {
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						userId: "{{userId}}",
						role: "EVALUATOR"
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/company/{{companyId}}/members" }
			}
		}
	]
});

// 03. Problem Bank
collection.item.push({
	name: "03. Problem Bank Management",
	item: [
		{
			name: "01. Create MCQ Problem",
			event: [createProblemTestScript],
			request: {
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						title: "Node.js Event Loop Phase Priority",
						description: "Which event loop phase executes timers like setTimeout?",
						type: "MCQ",
						difficulty: "EASY",
						defaultMarks: 5,
						mcqQuestion: {
							question: "In Node.js event loop, which phase executes setTimeout callbacks?",
							multipleCorrect: false,
							options: [
								{ text: "Timers Phase", isCorrect: true, explanation: "Timers phase executes setTimeout & setInterval callbacks." },
								{ text: "Poll Phase", isCorrect: false },
								{ text: "Check Phase", isCorrect: false },
								{ text: "Close Callbacks", isCorrect: false }
							]
						}
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/problem/create-problem" }
			}
		},
		{
			name: "02. Create Written Problem",
			event: [createProblemTestScript],
			request: {
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						title: "Explain Database Indexing Architecture",
						description: "Explain how B-Tree indexes optimize read latency in PostgreSQL.",
						type: "WRITTEN",
						difficulty: "MEDIUM",
						defaultMarks: 10,
						writtenQuestion: {
							guidelines: "Mention B-Tree structure, time complexity, write amplification trade-offs.",
							minWords: 30,
							maxWords: 500
						}
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/problem/create-problem" }
			}
		},
		{
			name: "03. Get All Problems (Admin Directory)",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/problem/" }
			}
		},
		{
			name: "04. Get My Company Problems",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/problem/company-problems" }
			}
		},
		{
			name: "05. Get Problem Details by ID",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/problem/{{problemId}}" }
			}
		},
		{
			name: "06. Update Problem",
			request: {
				method: "PATCH",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						title: "Node.js Event Loop Architecture (Updated)",
						difficulty: "MEDIUM"
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/problem/{{problemId}}" }
			}
		},
		{
			name: "07. Delete Problem",
			request: {
				method: "DELETE",
				header: [],
				url: { raw: "{{baseUrl}}/problem/{{problemId}}" }
			}
		}
	]
});

// 04. Assessment Lifecycle
collection.item.push({
	name: "04. Assessment Creation & Lifecycle",
	item: [
		{
			name: "01. Create Assessment (Draft)",
			event: [createAssessmentTestScript],
			request: {
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						title: "Senior Backend Engineer Benchmark 2026",
						description: "Comprehensive technical evaluation covering architecture, event loop, and databases.",
						totalMarks: 100,
						passMarks: 50,
						durationMinutes: 60,
						startTime: "2026-01-01T00:00:00.000Z",
						endTime: "2027-12-31T23:59:59.000Z",
						allowedAttempts: 1,
						isStrictTimeLimit: true,
						proctoringSettings: {
							trackTabSwitches: true,
							maxTabSwitches: 3,
							requireFullscreen: true,
							blockCopyPaste: true,
							trackFocusLoss: true
						}
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/assessment/create-assessment" }
			}
		},
		{
			name: "02. Add Problems to Assessment",
			request: {
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						problems: [
							{ problemId: "{{problemId}}", marks: 5, questionOrder: 1 }
						]
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/assessment/add-problems/{{assessmentId}}" }
			}
		},
		{
			name: "03. Publish Assessment",
			request: {
				method: "PATCH",
				header: [],
				url: { raw: "{{baseUrl}}/assessment/publish-assessment/{{assessmentId}}" }
			}
		},
		{
			name: "04. Invite Candidate to Assessment",
			request: {
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						emails: ["tested.candidate@devassess.com"]
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/assessment/invite-candidates/{{assessmentId}}" }
			}
		},
		{
			name: "05. Get Assessment Invitations",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/assessment/{{assessmentId}}/invitations" }
			}
		},
		{
			name: "06. Start Attempt (Candidate)",
			event: [startAttemptTestScript],
			request: {
				method: "POST",
				header: [],
				url: { raw: "{{baseUrl}}/assessment/start-attempt/{{assessmentId}}" }
			}
		},
		{
			name: "07. Get Candidate My Attempts",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/assessment/my-attempts" }
			}
		},
		{
			name: "08. Get Attempt Details",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/assessment/attempts/{{attemptId}}" }
			}
		},
		{
			name: "09. Finalize & Submit Attempt",
			request: {
				method: "POST",
				header: [],
				url: { raw: "{{baseUrl}}/assessment/attempts/{{attemptId}}/submit" }
			}
		},
		{
			name: "10. Get Attempt Result Preview",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/assessment/attempts/{{attemptId}}/result" }
			}
		},
		{
			name: "11. Get Detailed Assessment Report (Recruiter/Admin)",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/assessment/attempts/{{attemptId}}/detailed-report" }
			}
		}
	]
});

// 05. Solution Submissions
collection.item.push({
	name: "05. Solution Submissions",
	item: [
		{
			name: "01. Submit Solution (MCQ or Written)",
			event: [createSubmissionTestScript],
			request: {
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						attemptId: "{{attemptId}}",
						problemId: "{{problemId}}",
						writtenAnswer: "PostgreSQL B-Tree indexes provide logarithmic search O(log N) efficiency by organizing balanced keys into tree leaf nodes, reducing disk I/O."
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/submission/" }
			}
		},
		{
			name: "02. Get All Submissions for Attempt",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/submission/attempts/{{attemptId}}" }
			}
		},
		{
			name: "03. Get My Submissions History",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/submission/my-submissions" }
			}
		},
		{
			name: "04. Finalize Individual Submission Answer",
			request: {
				method: "POST",
				header: [],
				url: { raw: "{{baseUrl}}/submission/{{submissionId}}/submit" }
			}
		}
	]
});

// 06. Anti-Cheating Telemetry
collection.item.push({
	name: "06. Anti-Cheating Telemetry & Risk Scoring",
	description: "Endpoints for real-time telemetry ingestion during live assessments, automated risk score calculation, and manual flagging.",
	item: [
		{
			name: "01. Report Tab Switch Event",
			request: {
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						clientTimestamp: new Date().toISOString(),
						details: "Candidate navigated away to external Chrome window"
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/anti-cheating/attempt/{{attemptId}}/tab-switch" }
			}
		},
		{
			name: "02. Report Copy / Paste Event",
			request: {
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						clientTimestamp: new Date().toISOString(),
						details: "Pasted large block of text into editor",
						metadata: { characterCount: 180 }
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/anti-cheating/attempt/{{attemptId}}/copy-paste" }
			}
		},
		{
			name: "03. Report Fullscreen Exit Event",
			request: {
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						clientTimestamp: new Date().toISOString(),
						details: "Candidate exited fullscreen view"
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/anti-cheating/attempt/{{attemptId}}/fullscreen-exit" }
			}
		},
		{
			name: "04. Report Multiple Concurrent Tabs",
			request: {
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						clientTimestamp: new Date().toISOString(),
						details: "Secondary tab heartbeat detected on same user session"
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/anti-cheating/attempt/{{attemptId}}/multiple-tabs" }
			}
		},
		{
			name: "05. Report Suspicious Activity (DevTools Hook)",
			request: {
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						clientTimestamp: new Date().toISOString(),
						details: "Browser developer tools opened during active assessment"
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/anti-cheating/attempt/{{attemptId}}/suspicious-activity" }
			}
		},
		{
			name: "06. Calculate Real-Time Cheating Risk Score",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/anti-cheating/attempt/{{attemptId}}/risk" }
			}
		},
		{
			name: "07. Flag Attempt for Review (Proctor / Recruiter)",
			request: {
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						reason: "Excessive window switching and multiple tabs opened during test",
						severity: "HIGH"
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/anti-cheating/attempt/{{attemptId}}/flag" }
			}
		}
	]
});

// 07. Evaluation Engine
collection.item.push({
	name: "07. Automated & Manual Evaluation Engine",
	item: [
		{
			name: "01. Automated MCQ Evaluation",
			request: {
				method: "POST",
				header: [],
				url: { raw: "{{baseUrl}}/evaluation/mcq/{{submissionId}}" }
			}
		},
		{
			name: "02. Manual Written Question Evaluation (Evaluator)",
			request: {
				method: "POST",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({
						marksObtained: 9,
						feedback: "Comprehensive understanding of PostgreSQL indexing and algorithmic complexity."
					}, null, 2)
				},
				url: { raw: "{{baseUrl}}/evaluation/manual/{{submissionId}}" }
			}
		},
		{
			name: "03. Aggregate Total Attempt Score",
			request: {
				method: "POST",
				header: [],
				url: { raw: "{{baseUrl}}/evaluation/attempt/{{attemptId}}/score" }
			}
		},
		{
			name: "04. Get All Evaluations (Paginated & Filtered)",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/evaluation/" }
			}
		},
		{
			name: "05. Get Evaluation by ID",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/evaluation/{{submissionId}}" }
			}
		}
	]
});

// 08. Score Calculation
collection.item.push({
	name: "08. Score Calculation & Granular Breakdown",
	item: [
		{
			name: "01. Unified Submission Score Breakdown",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/score-calculation/submission/{{submissionId}}" }
			}
		},
		{
			name: "02. Granular MCQ Score Calculation",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/score-calculation/mcq/{{submissionId}}/score" }
			}
		},
		{
			name: "03. Granular Written Score Calculation",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/score-calculation/written/{{submissionId}}/score" }
			}
		},
		{
			name: "04. Aggregate Attempt Score Breakdown",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/score-calculation/attempt/{{attemptId}}" }
			}
		}
	]
});

// 09. Ranking & Results
collection.item.push({
	name: "09. Ranking Engine & Leaderboards",
	item: [
		{
			name: "01. Generate / Finalize Result for Attempt",
			request: {
				method: "POST",
				header: [],
				url: { raw: "{{baseUrl}}/ranking-result/generate/{{attemptId}}" }
			}
		},
		{
			name: "02. Calculate Competitive Rank & Percentile",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/ranking-result/rank/{{attemptId}}" }
			}
		},
		{
			name: "03. Get Assessment Leaderboard",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/ranking-result/leaderboard/{{assessmentId}}" }
			}
		},
		{
			name: "04. Publish Official Assessment Results",
			request: {
				method: "POST",
				header: [],
				url: { raw: "{{baseUrl}}/ranking-result/publish/{{assessmentId}}" }
			}
		},
		{
			name: "05. Candidate My Results (Across All Tests)",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/ranking-result/my-results" }
			}
		},
		{
			name: "06. Get Candidate Attempt Result",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/ranking-result/attempt/{{attemptId}}" }
			}
		}
	]
});

// 10. Reports & Analytics
collection.item.push({
	name: "10. Reports & Analytics Intelligence",
	item: [
		{
			name: "01. Generate Comprehensive Assessment Report",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/reports-analytics/assessment/{{assessmentId}}/report" }
			}
		},
		{
			name: "02. Score Frequency Distribution & Variance",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/reports-analytics/assessment/{{assessmentId}}/score-distribution" }
			}
		},
		{
			name: "03. Granular Pass / Fail Statistics",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/reports-analytics/assessment/{{assessmentId}}/pass-fail" }
			}
		},
		{
			name: "04. Problem Difficulty Statistics & Metrics",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/reports-analytics/assessment/{{assessmentId}}/statistics" }
			}
		},
		{
			name: "05. Candidate Performance & Cohort Benchmark",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/reports-analytics/attempt/{{attemptId}}/performance" }
			}
		},
		{
			name: "06. Candidate Career Analytical Report",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/reports-analytics/candidate/{{candidateId}}/report" }
			}
		},
		{
			name: "07. Organization Pipeline & Talent Report",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/reports-analytics/company/{{companyId}}/report" }
			}
		}
	]
});

// 11. Admin Management & Telemetry
collection.item.push({
	name: "11. Admin Management & System Telemetry",
	item: [
		{
			name: "01. Platform Dashboard Statistics",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/admin-management/dashboard-statistics" }
			}
		},
		{
			name: "02. System & Infrastructure Telemetry",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/admin-management/system-statistics" }
			}
		},
		{
			name: "03. Users Management Directory",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/admin-management/users" }
			}
		},
		{
			name: "04. User Profile Dossier by ID",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/admin-management/users/{{userId}}" }
			}
		},
		{
			name: "05. Update User Status (Activate/Deactivate)",
			request: {
				method: "PATCH",
				header: [{ key: "Content-Type", value: "application/json" }],
				body: {
					mode: "raw",
					raw: JSON.stringify({ isActive: true }, null, 2)
				},
				url: { raw: "{{baseUrl}}/admin-management/users/{{userId}}/status" }
			}
		},
		{
			name: "06. Delete User",
			request: {
				method: "DELETE",
				header: [],
				url: { raw: "{{baseUrl}}/admin-management/users/{{userId}}" }
			}
		},
		{
			name: "07. Companies Management Audit Log",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/admin-management/companies" }
			}
		},
		{
			name: "08. Assessments Audit Directory",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/admin-management/assessments" }
			}
		},
		{
			name: "09. Submissions Audit Log",
			request: {
				method: "GET",
				header: [],
				url: { raw: "{{baseUrl}}/admin-management/submissions" }
			}
		}
	]
});

const outputPath = path.join(process.cwd(), "Developer_Assessment_Platform.postman_collection.json");
fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2), "utf8");

// Also copy to Developer_Assessment_Platform_Auth.postman_collection.json for convenience
const authOutputPath = path.join(process.cwd(), "Developer_Assessment_Platform_Auth.postman_collection.json");
fs.writeFileSync(authOutputPath, JSON.stringify(collection, null, 2), "utf8");

console.log("✅ Postman Collection successfully generated with all 12 modules and endpoints!");
