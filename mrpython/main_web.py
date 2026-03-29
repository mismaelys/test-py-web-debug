import sys
import json
from io import StringIO
from StudentRunner import StudentRunner
from FullRunner import FullRunner

user_namespace = {}

def run_from_web(filename, source, is_student_mode):
    global user_namespace 

    old_stdout, old_stderr = sys.stdout, sys.stderr
    capture = StringIO()
    sys.stdout = capture
    sys.stderr = capture

    try:
        is_student = bool(is_student_mode)
        if is_student:
            runner = StudentRunner(filename, source)
        else:
            runner = FullRunner(filename, source)

        success = runner.execute(user_namespace)
        report = runner.get_report()
        
        feedback = [str(err) for err in getattr(report, 'convention_errors', [])]

        return {
            "success": success,
            "output": capture.getvalue(),
            "nb_tests": getattr(runner, 'nb_asserts', 0),
            "feedback": feedback,
            "errors_list": [str(e) for e in (report.compilation_errors + report.execution_errors)]
        }
    except Exception as e:
        return {"success": False, "output": "", "errors_list": [f"Erreur : {str(e)}"], "feedback": [], "nb_tests": 0}
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr

def evaluate_console(command):
    global user_namespace
    old_stdout, old_stderr = sys.stdout, sys.stderr
    capture = StringIO()
    sys.stdout = capture
    sys.stderr = capture
    
    try:
        try:
            result = eval(command, user_namespace)
            res_str = repr(result) if result is not None else None
        except SyntaxError:
            exec(command, user_namespace)
            res_str = None
            
        return {
            "output": capture.getvalue(),
            "result": res_str,
            "error": None
        }
    except Exception as e:
        return {"output": capture.getvalue(), "result": None, "error": str(e)}
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr