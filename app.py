from flask import Flask, send_file, jsonify, request
from flask_cors import CORS
import requests
import time
import logging

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

GOPHER_API_URL = "https://data.gopher-ai.com/api/v1/search/live/twitter"
GOPHER_AUTH_TOKEN = "Cwq3eiwszKKMpNjvLBBsTiHnSA3meann7qHoUpHStYJH7XHx"

@app.route('/api/twitter/search', methods=['POST'])
def twitter_search():
    data = request.get_json()
    query = data.get('query')
    if not query:
        return jsonify({"error": "Query is required"}), 400
    max_results = data.get('max_results', 20)  # Limit to 20 tweets
    
    headers = {
        "Authorization": f"Bearer {GOPHER_AUTH_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "type": "twitter",
        "arguments": {
            "type": "searchbyquery",
            "query": query,
            "max_results": max_results
        }
    }
    
    logger.debug(f"Sending search: {query}, max_results: {max_results}")
    try:
        response = requests.post(GOPHER_API_URL, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        response_data = response.json()
        logger.debug(f"Search Response: {response_data}")
        job_uuid = response_data.get('uuid')
        if not job_uuid:
            return jsonify({"error": "No uuid returned"}), 500
        return jsonify({"jobUUID": job_uuid})
    except Exception as e:
        logger.error(f"Search Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/twitter/result/<job_uuid>', methods=['GET'])
def twitter_result(job_uuid):
    headers = {
        "Authorization": f"Bearer {GOPHER_AUTH_TOKEN}"
    }
    try:
        response = requests.get(f"{GOPHER_API_URL}/result/{job_uuid}", headers=headers, timeout=60)
        response.raise_for_status()
        response_data = response.json()
        logger.debug(f"Result Response: {len(response_data)} tweets")
        return jsonify(response_data)
    except Exception as e:
        logger.error(f"Result Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/')
def serve_dashboard():
    return send_file('samudradashboard.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_file(filename)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)