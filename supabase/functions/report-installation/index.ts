import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

interface InstallationReport {
	userId: string;
	source: 'division-website' | 'manual' | 'unknown';
	timestamp: number;
	version: string;
}

serve(async (req) => {
	// Handle CORS
	if (req.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders });
	}

	try {
		// Verify authorization
		const authHeader = req.headers.get('authorization');
		if (!authHeader?.startsWith('Bearer ')) {
			return new Response(
				JSON.stringify({ error: 'Unauthorized' }),
				{ status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
			);
		}

		const report: InstallationReport = await req.json();

		// Validate required fields
		if (!report.userId || !report.source || !report.version) {
			return new Response(
				JSON.stringify({ error: 'Missing required fields' }),
				{ status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
			);
		}

		// Log installation report (in production, save to database)
		console.log('[Installation Report]', {
			userId: report.userId,
			source: report.source,
			timestamp: new Date(report.timestamp).toISOString(),
			version: report.version,
		});

		return new Response(
			JSON.stringify({ success: true, message: 'Installation reported successfully' }),
			{ status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
		);
	} catch (error: any) {
		console.error('Error processing installation report:', error);
		return new Response(
			JSON.stringify({ error: 'Internal server error', details: error.message }),
			{ status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
		);
	}
});
