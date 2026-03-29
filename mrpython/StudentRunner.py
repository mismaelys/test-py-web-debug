from code import InteractiveInterpreter
import inspect
from RunReport import RunReport
import ast
import tokenize
import sys
import traceback
import os
import copy
import re
from io import StringIO
from PreconditionHandler import PreconditionAstLinenoUpdater
from translate import tr
import typing
from typechecking.typechecker import typecheck_from_ast
from typechecking.type_ast import PREDEFINED_TYPE_VARIABLES

def install_locals(locals):
    # install the typing module
    locals['Sequence'] = typing.Sequence
    locals['List'] = typing.List
    locals['Set'] = typing.Set
    locals['Iterable'] = typing.Iterable
    locals['Tuple'] = typing.Tuple
    locals['Dict'] = typing.Dict
    locals['Optional'] = typing.Optional
    locals['Callable'] = typing.Callable
    locals['Image'] = None

    for tvar in PREDEFINED_TYPE_VARIABLES:
        locals[tvar] = typing.TypeVar(tvar)
    return locals

def parse_assertion_arg_values(func_name, code_str):
    """Parsing argument expression in assertion call"""
    fn_index = code_str.find(func_name)
    if fn_index == -1: return None
    i = fn_index
    while i < len(code_str) and code_str[i] != '(': i += 1
    if i >= len(code_str): return None
    arg_values = []
    i += 1
    level = 0
    arg = ""
    while i < len(code_str) and not (level == 0 and code_str[i] == ')'):
        if code_str[i] == '(': level += 1
        elif code_str[i] == ')': level -= 1
        elif code_str[i] == ',' and level == 0:
            arg_values.append(arg.strip())
            arg = ""
        elif code_str[i] != ' ' or level > 0: arg += code_str[i]
        i += 1
    arg_values.append(arg.strip())
    return arg_values

class StudentRunner:
    def __init__(self, filename, source):
        self.filename = filename
        self.source = source
        self.AST = None
        self.report = RunReport()
        self.running = True
        self.nb_asserts = 0

    def get_report(self):
        return self.report

    def execute(self, locals, capture_stdout=True):
        try:
            self.AST = ast.parse(self.source, self.filename)
        except Exception as err:
            self.report.add_compilation_error('error', "Syntax Error", getattr(err, 'lineno', None), getattr(err, 'offset', None), details=str(err))
            return False

        ret_val = True
        if not self.check_rules(self.report):
            ret_val = False
            self.run(locals, capture_stdout) 
        else:
            self.add_FunctionPreconditions()
            ret_val = self.run(locals, capture_stdout) 
            if ret_val:
                self.report.nb_passed_tests = self.nb_asserts
        return ret_val

    def _exec_or_eval(self, mode, code, globs, locs):
        try:
            if mode=='exec':
                exec(code, globs, locs)
            elif mode=='eval':
                eval(code, globs, locs)
            return (True, None)
        except Exception as err:
            a, b, tb = sys.exc_info()
            lineno = None
            traceb = traceback.extract_tb(tb)
            if len(traceb) > 1: lineno = traceb[-1].lineno
            self.report.add_execution_error('error', a.__name__, lineno, details=str(err))
            return (False, None)
        finally:
            self.running = False

    def run(self, locals, capture_stdout=True):
        locals = install_locals(locals)
        try:
            code = compile(self.AST, self.filename, 'exec')
        except Exception as err:
            self.report.add_compilation_error('error', "Compile Error", None, details=str(err))
            return False
            
        (ok, result) = self._exec_or_eval('exec', code, locals, locals)
        if capture_stdout and hasattr(sys.stdout, 'getvalue'):
            self.report.set_output(sys.stdout.getvalue())
        return ok

    def check_rules(self, report):
        res_asserts = self.check_asserts()
        res_types = self.check_types()
        return res_asserts and res_types

    def check_specifications(self): return True

    def check_asserts(self):
        self.nb_asserts = 0
        defined_funs = set()
        funcalls = set()
        for node in self.AST.body:
            if isinstance(node, ast.Assert):
                call_visit = FunCallsVisitor()
                call_visit.visit(node)
                self.nb_asserts += 1
                funcalls.update(call_visit.funcalls)
            elif isinstance(node, ast.FunctionDef):
                defined_funs.add(node.name)
        
        self.report.nb_defined_funs = len(defined_funs)
        missing = defined_funs.difference(funcalls)
        
        if missing:
            self.report.add_convention_error('warning', tr('Missing tests'), details="\n" + tr('Untested functions: ') + "{}".format(missing))
        elif defined_funs:
            self.report.add_convention_error('run', tr('All functions tested'), details=tr("All functions tested (good)"))
        return True

    def check_types(self):
        try:
            type_ctx = typecheck_from_ast(self.AST, self.filename, self.source)
            if len(type_ctx.type_errors) == 0:
                self.report.add_convention_error('run', tr('Program type-checked'), details=tr('==> the program is type-checked (very good)\n'))
                return True
            for type_error in type_ctx.type_errors:
                type_error.report(self.report)
            return not any(te.is_fatal() for te in type_ctx.type_errors)
        except: return True 

    def add_FunctionPreconditions(self):
        try:
            self.AST = FunctionDefVisitor().visit(self.AST)
            self.AST = ast.fix_missing_locations(self.AST)
        except: pass

class FunCallsVisitor(ast.NodeVisitor):
    def __init__(self):
        self.funcalls = set()
    def visit_Call(self, node):
        if hasattr(node.func, "id"):
            self.funcalls.add(node.func.id)
        self.generic_visit(node)

from typechecking.typechecker import preconditions
preconditionsLineno = []

class FunctionDefVisitor(ast.NodeTransformer):
    def visit_FunctionDef(self, node):
        if node.name not in preconditions.keys() or len(preconditions[node.name]) == 0:
            return node
        ast_asserts = []
        for prec_node in preconditions[node.name]:
            lineno = prec_node.lineno
            preconditionsLineno.append(lineno)
            assert_node = ast.Assert(test=prec_node, msg=ast.Constant("<<<PRECONDITION>>>"))
            assert_node.lineno = lineno
            ast_asserts.append(assert_node)
        node.body = ast_asserts + node.body
        return node