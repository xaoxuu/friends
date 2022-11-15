# -*- coding: utf-8 -*-
import yaml


def load():
    f = open('config.yml', 'r', encoding='utf-8')
    ystr = f.read()
    ymllist = yaml.load(ystr, Loader=yaml.FullLoader)
    return ymllist