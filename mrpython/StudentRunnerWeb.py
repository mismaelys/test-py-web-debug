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
from io import StringIO #ajout
from PreconditionHandler import PreconditionAstLinenoUpdater

from translate import tr

#modification (retrait imports gfx)

import typing

from typechecking.typechecker import typecheck_from_ast
from typechecking.type_ast import PREDEFINED_TYPE_VARIABLES

def install_locals(locals):
    # install the gfx lib
    #modification (retrait des fonctions gfx non compatibles)

    # install the typing module
    locals['Sequence'] = typing.Sequence
    locals['List'] = typing.List
    locals['Set'] = typing.Set
    locals['Iterable'] = typing.Iterable
    locals['Tuple'] = typing.Tuple
    locals['Dict'] = typing.Dict
    locals['Optional'] = typing.Optional
    locals['Callable'] = typing.Callable

    # hack
    locals['Image'] = None

    for tvar in PREDEFINED_TYPE_VARIABLES:
        locals[tvar] = typing.TypeVar(tvar)

    return locals

class StudentRunnerWeb:
    """
    Runs a code under the student mode
    """

    def __init__(self, filename, source): #modification (retrait tk_root)
        self.filename = filename
        self.source = source
        self.AST = None
        self.report = RunReport()
        #modification (retrait tk_root)
        self.running = True

    def get_report(self):
        """ Return the report """
        return self.report


    def execute(self, locals, capture_stdout=True):
        """ Run the file : customized parsing for checking rules,
            compile and execute """
        # Compile the code and get the AST from it, which will be used for all
        # the conventions checkings that need to be done

        try:
            self.AST = ast.parse(self.source, self.filename)
        # Handle the different kinds of compilation errors
        except IndentationError as err:
            self.report.add_compilation_error('error', tr("Bad indentation"), err.lineno, err.offset)
            return False
        except SyntaxError as err:
            self.report.add_compilation_error('error', tr("Syntax error"), err.lineno, err.offset, details=err.text)
            return False
        except Exception as err:
            typ, exc, tb = sys.exc_info()
            self.report.add_compilation_error('error', str(typ), getattr(err, 'lineno', None), getattr(err, 'offset', None), details=str(err)) #modification
            return False

        # No parsing error here

        # perform the local checks
        ret_val = True
        if not self.check_rules(self.report):
            ret_val = False
            self.run(locals, capture_stdout) # we still run the code even if there is a convention error
        else:
            self.add_FunctionPreconditions()
            ret_val = self.run(locals, capture_stdout) # Run the code if it passed all the convention tests
            if ret_val:
                self.report.nb_passed_tests = self.nb_asserts

        return ret_val

    def _extract_error_details(self, err):
        err_str = err.args[0]
        start = err_str.find("'") + 1
        end = err_str.find("'", start + 1)
        details = err_str[start:end]
        return details

    def _exec_or_eval(self, mode, code, globs, locs):
        assert mode=='exec' or mode=='eval'
        try:
            if mode=='exec':
                result = exec(code, globs, locs)
            elif mode=='eval':
                result = eval(code, globs, locs)
        except TypeError as err:
            a, b, tb = sys.exc_info()
            filename, lineno, file_type, line = traceback.extract_tb(tb)[-1]
            #err_str = self._extract_error_details(err) #modification (parfois instable)
            self.report.add_execution_error('error', tr("Type error"), lineno, details=str(err))
            return (False, None)
        except NameError as err:
            a, b, tb = sys.exc_info() 
            filename, lineno, file_type, line = traceback.extract_tb(tb)[-1]
            #err_str = self._extract_error_details(err) #modification
            self.report.add_execution_error('error', tr("Name error (unitialized variable?)"), lineno, details=str(err))
            return (False, None)
        except ZeroDivisionError:
            a, b, tb = sys.exc_info()
            filename, lineno, file_type, line = traceback.extract_tb(tb)[-1]
            self.report.add_execution_error('error', tr("Division by zero"), lineno if mode=='exec' else None)
            return (False, None)
        except AssertionError as err:
            _, _, tb = sys.exc_info()
            lineno=None
            traceb = traceback.extract_tb(tb)
            if len(traceb) > 1:
                _, lineno, _, line = traceb[-1]
            if len(traceb) > 1 and err.args and err.args[0] == "<<<PRECONDITION>>>":
                s = "Precondition error\n\t Function : {} (Line {})\n\t Precondition : {}\n\t False with {}"
                func_name = traceb[-1].name
                assert_lineno = traceb[-2].lineno
                code_tb = traceb[-2].line
                arg_names = []
                arg_values = []

                #modification : l'usage d'inspect peut être limité sur le web
                try:
                    source_code = self.source #modification
                    tree = ast.parse(source_code)
                    for node in ast.walk(tree):
                        if isinstance(node, ast.FunctionDef) and node.name == func_name:
                            for argg in node.args.args:
                                arg_names.append(argg.arg)
                except: pass

                arg_values = parse_assertion_arg_values(func_name, code_tb)

                if len(arg_names) <= len(arg_values) : 
                    arg = "\n\t"
                    for i in range(len(arg_names)):
                        arg += "\t" + str(arg_names[i]) + " = " + str(arg_values[i]) + "\n\t"
                else : 
                    arg = "" #modification (fallback)
                        
                if lineno in preconditionsLineno:
                    self.report.add_execution_error('error', tr(s).format(func_name, lineno, line.split(':', 1)[-1].strip() if line else "?", arg), assert_lineno)
            else:
                self.report.add_execution_error('error', tr("Assertion error (failed test?)") + (f"\n ==> {str(err)}" if str(err) else ""), lineno)
            return (True, None)
        except Exception as err:
            a, b, tb = sys.exc_info() 
            lineno=None
            traceb = traceback.extract_tb(tb)
            if len(traceb) > 1:
                filename, lineno, file_type, line = traceb[-1]
            if hasattr(a, '__name__'):
                self.report.add_execution_error('error', a.__name__, lineno, details=str(err))
            else:
                self.report.add_execution_error('error', "Exception", lineno, details=str(err))
            return (False, None)
        finally:
            self.running = False

        return (True, result)


    def run(self, locals, capture_stdout=True):
        """ Run the code, add the execution errors to the rapport, if any """
        locals = install_locals(locals)
        code = None
        try:
            code = compile(self.AST, self.filename, 'exec')
        except SyntaxError as err:
            self.report.add_compilation_error('error', tr("Syntax error"), err.lineno, err.offset, details=str(err))
            return False
        except Exception as err:
            typ, exc, tb = sys.exc_info()
            self.report.add_compilation_error('error', str(typ), getattr(err, 'lineno', None), getattr(err, 'offset', None), details=str(err)) #modification
            return False
        (ok, result) = self._exec_or_eval('exec', code, locals, locals)

        # if no error get the output
        if capture_stdout:
            #modification
            result = sys.stdout.getvalue() if hasattr(sys.stdout, 'getvalue') else "" #modification
            self.report.set_output(result)

        return ok


    def evaluate(self, expr, locals):
        """ Launches the evaluation with the locals dict built before """
        locals = install_locals(locals)
        (ok, result) = self._exec_or_eval('eval', expr, locals, locals)
        if not ok:
            return False
        else:
            #modification
            outp = sys.stdout.getvalue() if hasattr(sys.stdout, 'getvalue') else "" #modification
            self.report.set_output(outp)
            self.report.set_result(result)
            return True

    def check_rules(self, report):
        """ Check if the code follows the class rules """
        if not self.check_asserts():
            return False
        if not self.check_specifications():
            return False

        if not self.check_types():
            return False

        return True

    def check_specifications(self):
        """ Is there a valid specification for each function ? """
        # Put the checking code here
        return True


    def check_asserts(self):
        """ Are there asserts at the end of the source code ? """
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
            self.report.add_convention_error('warning', tr('Missing tests')
                                             , details="\n" + tr('Untested functions: ')
                                             + "{}".format(missing) + "\n")
        elif defined_funs:
            # all the functions are tested at least once
            self.report.add_convention_error('run', tr('All functions tested'), details="==> " + tr("All functions tested (good)"))

        return True

    def check_types(self):
        type_ctx = typecheck_from_ast(self.AST, self.filename, self.source)
        fatal_error = False
        if len(type_ctx.type_errors) == 0:
            # no type error
            self.report.add_convention_error('run', tr('Program type-checked'), details=tr('==> the program is type-checked (very good)\n'))
            return True

        # convert type errors to report messages
        for type_error in type_ctx.type_errors:
            type_error.report(self.report)
            if type_error.is_fatal():
                fatal_error = True

        return not fatal_error

    def add_FunctionPreconditions(self):
        # TODO : because of changes in python 3.11+ dynamic compilation
        #        we cannot add precondition checking code in this
        #        way (hiding line numbers)
        # a new scheme will be introduced
        self.AST = FunctionDefVisitor().visit(self.AST)
        self.AST = ast.fix_missing_locations(self.AST)


def parse_assertion_arg_values(func_name, code_str):
    """Parsing argumentexpression in assertion call"""
    if not code_str: return [] #ajout
    fn_index = code_str.find(func_name)
    if fn_index == -1:
        return [] #modification
    
    i = fn_index
    while i < len(code_str) and code_str[i] != '(':
        i += 1
    if i >= len(code_str):
        return [] #modification

    arg_values = []
    i += 1
    level = 0
    arg = ""
    while i < len(code_str) and not (level == 0 and code_str[i] == ')'):

        if code_str[i] == '(':
            level += 1
            arg += code_str[i]
        elif code_str[i] == ')':
            level -= 1
            arg += code_str[i]
        elif code_str[i] == ',' and level == 0:
            arg_values.append(arg.strip())
            arg = ""
        elif code_str[i] == ' ':
            pass
        else:
            arg += code_str[i]

        i += 1

    arg_values.append(arg)

    return arg_values        

class FunCallsVisitor(ast.NodeVisitor):
    def __init__(self):
        self.funcalls = set()

    def visit_children(self, node):
        super(FunCallsVisitor, self).generic_visit(node)

    def visit_Call(self, node):
        if hasattr(node.func, "id"):
            self.funcalls.add(node.func.id)
        self.visit_children(node)

from typechecking.typechecker import preconditions

preconditionsLineno = []

class FunctionDefVisitor(ast.NodeTransformer):
    def visit_FunctionDef(self, node):
        if node.name not in preconditions.keys() or len(preconditions[node.name]) == 0:
            return node
        else:
            ast_asserts = []
            new_end_lineno = 0
            for precondition_node in preconditions[node.name]:
                lineno = precondition_node.lineno # Is the right assertion lineno
                PreconditionAstLinenoUpdater(lineno).visit(precondition_node)
                preconditionsLineno.append(lineno)
                assert_node = ast.Assert(test=precondition_node)
                assert_node.msg = ast.Constant("<<<PRECONDITION>>>")
                assert_node.lineno = lineno + new_end_lineno
                assert_node.end_lineno = assert_node.lineno
                ast_asserts.append(assert_node)
                new_end_lineno += 1
            
            # Line number synchronization to avoid an overlapping scenario
            line_diff = new_end_lineno - node.lineno
            ast.increment_lineno(node, n=line_diff)
            if hasattr(node, "type_comment"):
                node_res = ast.FunctionDef(node.name,node.args,ast_asserts+node.body,node.decorator_list,node.returns,node.type_comment,lineno = node.lineno,col_offset = node.col_offset, end_lineno = node.lineno, end_col_offset = node.end_col_offset)
            else: # python 3.7
                node_res = ast.FunctionDef(node.name,node.args,ast_asserts+node.body,node.decorator_list,node.returns,lineno = node.lineno,col_offset = node.col_offset, end_lineno = node.lineno)

            return node_res