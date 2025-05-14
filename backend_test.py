import requests
import os
import sys
from pathlib import Path

class VideoEditorAPITester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.uploaded_file_id = None
        self.project_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None, json_data=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'} if json_data else {}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, data=data)
                else:
                    response = requests.post(url, json=json_data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=json_data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"Response: {response.text}")
                    return False, response.json()
                except:
                    return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test the root API endpoint"""
        success, response = self.run_test(
            "Root API Endpoint",
            "GET",
            "api",
            200
        )
        return success

    def test_filters_endpoint(self):
        """Test the filters endpoint"""
        success, response = self.run_test(
            "Filters Endpoint",
            "GET",
            "api/filters",
            200
        )
        if success:
            print(f"Available filters: {len(response)} filters found")
            for filter in response[:3]:  # Show first 3 filters
                print(f"  - {filter['name']}: {filter['description']}")
        return success

    def test_upload_video(self, video_path):
        """Test video upload functionality"""
        if not Path(video_path).exists():
            print(f"❌ Test video file not found at {video_path}")
            return False
        
        files = {'file': open(video_path, 'rb')}
        success, response = self.run_test(
            "Upload Video",
            "POST",
            "api/upload-video",
            200,
            files=files
        )
        
        if success and 'file_id' in response:
            self.uploaded_file_id = response['file_id']
            print(f"Uploaded file ID: {self.uploaded_file_id}")
            return True
        return False

    def test_create_project(self, video_path, project_name="Test Project"):
        """Test project creation"""
        if not Path(video_path).exists():
            print(f"❌ Test video file not found at {video_path}")
            return False
        
        files = {'video_file': open(video_path, 'rb')}
        project_data = {
            "name": project_name,
            "segments": [],
            "effects": [],
            "text_overlays": [],
            "duration": 10.0
        }
        
        data = {'project_data': str(project_data).replace("'", '"')}
        success, response = self.run_test(
            "Create Project",
            "POST",
            "api/projects",
            200,
            files=files,
            data=data
        )
        
        if success and 'id' in response:
            self.project_id = response['id']
            print(f"Created project ID: {self.project_id}")
            return True
        return False

    def test_get_projects(self):
        """Test getting all projects"""
        success, response = self.run_test(
            "Get All Projects",
            "GET",
            "api/projects",
            200
        )
        if success:
            print(f"Found {len(response)} projects")
        return success

    def test_update_project(self):
        """Test updating a project"""
        if not self.project_id:
            print("❌ No project ID available for update test")
            return False
        
        update_data = {
            "name": "Updated Test Project",
            "effects": [
                {
                    "type": "filter",
                    "value": "grayscale",
                    "start_time": 0,
                    "end_time": 5
                }
            ]
        }
        
        success, response = self.run_test(
            "Update Project",
            "PUT",
            f"api/projects/{self.project_id}",
            200,
            json_data=update_data
        )
        
        if success:
            print(f"Project updated with new name: {response.get('name')}")
            print(f"Effects added: {len(response.get('effects', []))}")
        return success

    def test_export_project(self):
        """Test exporting a project"""
        if not self.project_id:
            print("❌ No project ID available for export test")
            return False
        
        export_data = {
            "quality": "low",
            "format": "mp4",
            "segments_only": False
        }
        
        success, response = self.run_test(
            "Export Project",
            "POST",
            f"api/projects/{self.project_id}/export",
            200,
            json_data=export_data
        )
        
        if success:
            print(f"Export started with ID: {response.get('export_id')}")
            print(f"Status: {response.get('status')}")
        return success

def main():
    # Get backend URL from frontend .env file
    env_path = Path("/app/frontend/.env")
    backend_url = None
    
    if env_path.exists():
        with open(env_path, "r") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    backend_url = line.strip().split("=")[1]
                    break
    
    if not backend_url:
        print("❌ Could not find REACT_APP_BACKEND_URL in frontend/.env")
        return 1
    
    print(f"🚀 Testing Video Editor API at {backend_url}")
    
    # Setup tester
    tester = VideoEditorAPITester(backend_url)
    
    # Test video path
    test_video_path = "/app/backend/test_video.mp4"
    
    # Run tests
    tests = [
        ("Root API Endpoint", lambda: tester.test_root_endpoint()),
        ("Filters Endpoint", lambda: tester.test_filters_endpoint()),
        ("Upload Video", lambda: tester.test_upload_video(test_video_path)),
        ("Create Project", lambda: tester.test_create_project(test_video_path)),
        ("Get Projects", lambda: tester.test_get_projects()),
        ("Update Project", lambda: tester.test_update_project()),
        ("Export Project", lambda: tester.test_export_project())
    ]
    
    for test_name, test_func in tests:
        try:
            test_func()
        except Exception as e:
            print(f"❌ Exception in {test_name}: {str(e)}")
    
    # Print results
    print(f"\n📊 Tests passed: {tester.tests_passed}/{tester.tests_run}")
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())